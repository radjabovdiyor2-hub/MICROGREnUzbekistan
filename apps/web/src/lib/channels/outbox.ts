import { Prisma, prisma } from '@repo/database';

import { channelDef } from './registry';

// ══════════════════════════════════════════════════════════════════════
// Очередь «витрина → площадка»: остатки, цены, снятие с продажи.
//
// Устроена как зеркало `lib/office/outbox.ts` — с повторами, нарастающей
// паузой и честной причиной отказа. Разница одна: у офиса дверь есть
// всегда, а у площадки её может не быть вовсе. Тогда строка НЕ теряется и
// не притворяется отправленной — она ждёт человека, и владелец видит её
// на экране «Каналы» как «ждёт выгрузки».
//
// Тихий успех здесь стоит дороже всего: неотправленный нулевой остаток —
// это заказ на товар, которого нет, и штраф за отмену.
// ══════════════════════════════════════════════════════════════════════

/** Пауза до первой повторной попытки. Дальше удваивается. */
const BASE_DELAY_MS = 30_000;
/** Потолок паузы: настройки канала чинит человек, чаще стучаться незачем. */
const MAX_DELAY_MS = 60 * 60 * 1000;
/** Сколько строк берём за проход. */
const BATCH = 50;

export type ChannelTopic = 'stock' | 'price' | 'listing';

/**
 * Токены каналов, которым мы шлём обновления сами.
 *
 * Выписаны поимённо, а не собраны из кода канала: подстановка вида
 * `process.env['CHANNEL_' + code + '_TOKEN']` невидима для
 * `scripts/check_env_declared.py`, и незаданный ключ остался бы незамеченным
 * ровно до первого пропавшего остатка.
 */
function apiToken(code: string): string | undefined {
  if (code === 'tezkor') return process.env.CHANNEL_TEZKOR_TOKEN;
  if (code === 'yandex_eats') return process.env.CHANNEL_YANDEX_EATS_TOKEN;
  return undefined;
}

function backoff(attempts: number): Date {
  return new Date(Date.now() + Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS));
}

/**
 * Поставить обновление в очередь.
 *
 * Ключ `<канал>:<тема>:<товар>` — повторная постановка ПЕРЕЗАПИСЫВАЕТ тело.
 * Здесь это верно, а у очереди офиса наоборот: там событие («продажа
 * случилась»), и переписать его значило бы подменить историю. Тут состояние
 * («остатка столько»), и отправлять десять его версий подряд незачем.
 *
 * А вот `nextAttemptAt` при этом НЕ трогается, и это важнее, чем кажется.
 * Расписание повторов принадлежит здоровью канала, а не свежести тела:
 * планировщик проходит каждые пять минут и, сбрасывая паузу, стирал бы
 * весь откат. Найдено живым прогоном — застрявший канал с полусотней
 * строк заново становился «созревшим» на каждом проходе и не пускал
 * остальных к очереди вовсе.
 */
export async function enqueueChannelUpdate(input: {
  channelCode: string;
  topic: ChannelTopic;
  productId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const refKey = `${input.channelCode}:${input.topic}:${input.productId}`;
  const payload = input.payload as Prisma.InputJsonObject;
  await prisma.channelOutbox.upsert({
    where: { refKey },
    create: { channelCode: input.channelCode, topic: input.topic, refKey, payload },
    update: { payload },
  });
}

type Verdict = 'done' | 'retry' | 'drop' | 'wait-human';

/**
 * Как трактовать ответ площадки. Правило то же, что у очереди офиса:
 * 401/403 — это разошедшийся ключ, он чинится настройкой, поэтому строку
 * держим. Остальные 4xx — площадка разобрала тело и отказала по существу.
 */
function verdictFor(status: number): Verdict {
  if (status < 400) return 'done';
  if (status === 401 || status === 403) return 'retry';
  if (status < 500) return 'drop';
  return 'retry';
}

async function sendOne(row: {
  channelCode: string;
  topic: string;
  payload: Prisma.JsonValue;
}): Promise<{ verdict: Verdict; reason?: string }> {
  const def = channelDef(row.channelCode);
  if (!def) return { verdict: 'drop', reason: 'канал не описан в реестре' };

  // Площадка забирает выгрузку сама — отправлять нечего и незачем.
  if (def.syncMode === 'feed') return { verdict: 'done' };

  // Кабинет без API: остаток меняет человек. Строка остаётся очередью дел.
  if (def.syncMode === 'manual') {
    return { verdict: 'wait-human', reason: 'нужна выгрузка в кабинет площадки' };
  }

  const channel = await prisma.salesChannel.findUnique({
    where: { code: row.channelCode },
    select: { apiUrl: true },
  });
  const token = apiToken(row.channelCode);
  if (!channel?.apiUrl || !token) {
    return {
      verdict: 'retry',
      reason: !channel?.apiUrl
        ? 'у канала не задан адрес приёма (apiUrl)'
        : 'не задан токен канала в окружении',
    };
  }

  try {
    const response = await fetch(channel.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Topic': row.topic,
      },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(5000),
    });
    const verdict = verdictFor(response.status);
    return verdict === 'done' ? { verdict } : { verdict, reason: `площадка ответила ${response.status}` };
  } catch (err) {
    return { verdict: 'retry', reason: err instanceof Error ? err.message : 'нет связи с площадкой' };
  }
}

/**
 * Записать в листинг то, что площадка теперь действительно показывает.
 *
 * Только после успешной отправки. Обновить снимок заранее значило бы
 * считать отправленным то, что не доехало, — и следующий прогон уже не
 * увидел бы разницы и не повторил бы попытку.
 */
async function applySnapshot(channelCode: string, payload: Prisma.JsonValue): Promise<void> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const data = payload as Record<string, Prisma.JsonValue>;
  const productId = data.productId;
  if (typeof productId !== 'string') return;

  const channel = await prisma.salesChannel.findUnique({
    where: { code: channelCode },
    select: { id: true },
  });
  if (!channel) return;

  await prisma.channelListing
    .update({
      where: { channelId_productId: { channelId: channel.id, productId } },
      data: {
        isPublished: data.available === true,
        syncedStock: typeof data.quantity === 'number' ? data.quantity : null,
        price: typeof data.price === 'number' ? data.price : undefined,
      },
    })
    .catch(() => undefined);
}

/** Записать причину в канал — её видит владелец на экране «Каналы». */
async function noteChannelError(code: string, reason: string): Promise<void> {
  await prisma.salesChannel
    .update({ where: { code }, data: { lastError: reason.slice(0, 300) } })
    .catch(() => undefined);
}

export interface DrainReport {
  sent: number;
  /** Строки, которые ждут человека: выгрузку в кабинет площадки. */
  waiting: number;
  pending: number;
  /** Каналы, которые стоят дольше `STALL_HOURS`. Пустой список — норма. */
  stalled: StalledChannel[];
}

export interface StalledChannel {
  channel: string;
  /** Сколько часов ждёт самая старая строка канала. */
  hours: number;
  rows: number;
  reason: string | null;
}

/**
 * С какого возраста очередь считается застрявшей.
 *
 * Час — обычная жизнь: столько же составляет максимальная пауза повторов
 * (`MAX_DELAY_MS`), и площадка, полежавшая полчаса, догонит сама. А вот
 * шесть часов значат, что чинить придётся руками — либо у канала нет
 * адреса приёма, либо ждут выгрузки в кабинет, либо разошёлся секрет.
 * Всё это время площадка торгует вчерашними остатками.
 */
const STALL_HOURS = 6;

/**
 * Разобрать очередь. Никогда не бросает: её зовут по расписанию, и упасть
 * она может только в лог.
 */
export async function drainChannels(limit = BATCH): Promise<DrainReport> {
  let sent = 0;
  let waiting = 0;
  /** Каналы, на которых уже споткнулись: остальные их строки упрутся в то же. */
  const stuck = new Set<string>();

  try {
    const rows = await prisma.channelOutbox.findMany({
      where: { nextAttemptAt: { lte: new Date() } },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, channelCode: true, topic: true, payload: true, attempts: true },
    });

    for (const row of rows) {
      if (stuck.has(row.channelCode)) continue;

      const { verdict, reason } = await sendOne(row);

      if (verdict === 'done') {
        await applySnapshot(row.channelCode, row.payload);
        await prisma.channelOutbox.delete({ where: { id: row.id } });
        await prisma.salesChannel
          .update({ where: { code: row.channelCode }, data: { lastSyncAt: new Date(), lastError: null } })
          .catch(() => undefined);
        sent += 1;
        continue;
      }

      if (verdict === 'wait-human') {
        // Строка ждёт человека, а не сети, — откладываем весь канал разом
        // и по той же причине, что и застрявший: иначе он занимал бы
        // пачку собой, пока владелец не выгрузит файл.
        const pushed = await prisma.channelOutbox.updateMany({
          where: { channelCode: row.channelCode, nextAttemptAt: { lte: new Date() } },
          data: { nextAttemptAt: new Date(Date.now() + MAX_DELAY_MS), lastError: reason ?? null },
        });
        waiting += pushed.count;
        stuck.add(row.channelCode);
        continue;
      }

      if (verdict === 'drop') {
        await prisma.channelOutbox.delete({ where: { id: row.id } });
        await noteChannelError(row.channelCode, reason ?? 'площадка отказала');
        continue;
      }

      // Откладываем ВСЕ созревшие строки этого канала, а не только эту.
      //
      // Иначе канал с полусотней строк съедал всю пачку и не пускал
      // остальных: пачка берётся по возрастанию id, строки застрявшего
      // канала идут первыми и остаются созревшими, поэтому следующий
      // проход брал их же. Найдено живым прогоном: Uzum с 74 строками не
      // получал очереди, пока Tezkor ждал адреса приёма.
      const attempts = row.attempts + 1;
      await prisma.channelOutbox.updateMany({
        where: { channelCode: row.channelCode, nextAttemptAt: { lte: new Date() } },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: backoff(attempts),
          lastError: (reason ?? '').slice(0, 500),
        },
      });
      await noteChannelError(row.channelCode, reason ?? 'площадка недоступна');
      stuck.add(row.channelCode);
    }
  } catch (err) {
    console.error('[channels] очередь обновлений не разобрана:', err);
  }

  const pending = await prisma.channelOutbox.count().catch(() => 0);
  return { sent, waiting, pending, stalled: await findStalled() };
}


/**
 * Каналы, чья очередь стоит слишком долго.
 *
 * Пока этого не было, застрявший канал был виден только тому, кто сам
 * откроет экран «Каналы продаж»: `lastError` записывался в строку канала
 * и молчал. Ошибка в логе офиса раз в пять минут — не сигнал, а шум,
 * который читают после того, как заметят пропажу заказов.
 */
async function findStalled(): Promise<StalledChannel[]> {
  const threshold = new Date(Date.now() - STALL_HOURS * 60 * 60 * 1000);
  try {
    const groups = await prisma.channelOutbox.groupBy({
      by: ['channelCode'],
      where: { createdAt: { lt: threshold } },
      _count: { _all: true },
      _min: { createdAt: true },
      // Причину берём `_max`, а не первую попавшуюся: у строк одного
      // канала она одна и та же (её пишет `updateMany` на весь канал),
      // а группировке нужна агрегатная функция, иначе поле не отдать.
      _max: { lastError: true },
    });

    return groups.map((g) => {
      const oldest = g._min.createdAt ?? threshold;
      return {
        channel: g.channelCode,
        hours: Math.floor((Date.now() - oldest.getTime()) / (60 * 60 * 1000)),
        rows: g._count._all,
        reason: g._max.lastError,
      };
    });
  } catch (err) {
    // Диагностика не имеет права уронить разбор очереди: очередь важнее.
    console.error('[channels] не удалось посчитать застрявшие каналы:', err);
    return [];
  }
}
