import { Prisma, prisma, type TransactionClient } from '@repo/database';

import { audit } from '@/lib/audit';
import { inc } from '@/lib/metrics';
import { alertCrmSyncFailed } from '@/lib/orders/crmAlert';

import { ingestUrl } from './client';

// ══════════════════════════════════════════════════════════════════════
// Очередь «витрина → AI-офис». Зеркальное отражение `storefront_outbox`,
// которым офис уже давно шлёт статусы обратно на витрину.
//
// ЗАЧЕМ ОНА
//
// Продажа за прилавком уходила в CRM вызовом с `.catch(() => {})`: офис
// недоступен — привязка чека к клиенту потеряна НАВСЕГДА. Это не «отчёт
// придёт позже»: счётчики карточки (`orders_count`, `total_spent`,
// `last_order_date`) считаются офисом по `crm_orders`, поэтому непрошедшее
// зеркало означает ресторан, у которого покупки нет вовсе.
//
// Строка пишется В ТОЙ ЖЕ ТРАНЗАКЦИИ, что и чек: либо есть и продажа, и
// обещание её отзеркалить, либо нет ни того, ни другого. Отправка идёт
// сразу после ответа кассы — покупатель у прилавка ничего не ждёт.
// ══════════════════════════════════════════════════════════════════════

/** Дверь офиса. Значение идёт в `ingestUrl(topic)`. */
export type OfficeTopic = 'order' | 'order-status';

/** Пауза до первой повторной попытки. Дальше удваивается. */
const BASE_DELAY_MS = 30_000;

/** Потолок паузы: мост чинится руками, чаще стучаться незачем. */
const MAX_DELAY_MS = 60 * 60 * 1000;

/** После скольких неудач поднимаем тревогу владельцу. */
const ALERT_AFTER = 3;

/** Сколько строк берём за один проход. */
const BATCH = 25;

/**
 * Кого касается сбой — по префиксу номера.
 *
 * `S-` продажа, `R-` возврат, `M-` заказ с сайта. Владельцу в оповещении
 * важно, что именно не доехало: за прилавком это одна проблема, на сайте —
 * совсем другая.
 */
function channelOf(refKey: string): 'order' | 'pos' | 'refund' {
  if (refKey.startsWith('R-')) return 'refund';
  if (refKey.startsWith('S-')) return 'pos';
  return 'order';
}

function backoff(attempts: number): Date {
  const delay = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
  return new Date(Date.now() + delay);
}

/**
 * Поставить событие в очередь. Зовётся ВНУТРИ транзакции операции.
 *
 * Повторная постановка того же `refKey` строку не дублирует и не сбрасывает
 * счётчик попыток: тот же чек — то же событие.
 */
export async function enqueueOffice(
  tx: TransactionClient,
  input: { topic: OfficeTopic; refKey: string; payload: Record<string, unknown> },
): Promise<void> {
  await tx.officeOutbox.upsert({
    where: { refKey: input.refKey },
    create: {
      topic: input.topic,
      refKey: input.refKey,
      payload: input.payload as Prisma.InputJsonObject,
    },
    update: {},
  });
}

/** Что сделать со строкой после ответа офиса. */
type Verdict = 'done' | 'retry' | 'drop';

/**
 * Как трактовать ответ офиса.
 *
 * 401/403 — это НЕ «запрос негоден», а пустой или разошедшийся
 * `INGEST_SECRET`; ровно так однажды не доехал в CRM ни один заказ с сайта.
 * Такое чинится настройкой, поэтому строку держим и повторяем.
 *
 * Остальные 4xx — офис разобрал тело и отказал по существу. Повторять
 * бессмысленно, и держать очередь на такой строке нельзя: она стоит первой
 * и заблокировала бы все продажи за ней. Снимаем — но громко.
 */
function verdictFor(status: number): Verdict {
  if (status < 400) return 'done';
  if (status === 401 || status === 403) return 'retry';
  if (status < 500) return 'drop';
  return 'retry';
}

async function sendOne(row: {
  id: number;
  topic: string;
  refKey: string;
  payload: Prisma.JsonValue;
  attempts: number;
}): Promise<{ verdict: Verdict; reason?: string }> {
  try {
    const response = await fetch(ingestUrl(row.topic), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
      },
      body: JSON.stringify(row.payload),
      signal: AbortSignal.timeout(4000),
    });

    const verdict = verdictFor(response.status);
    if (verdict === 'done') return { verdict };
    return { verdict, reason: `офис ответил ${response.status}` };
  } catch (err) {
    // Сеть, таймаут, лежащий контейнер — всё это повторяемо.
    return { verdict: 'retry', reason: err instanceof Error ? err.message : 'нет связи с офисом' };
  }
}

async function markRetry(
  row: { id: number; refKey: string; attempts: number },
  reason: string,
): Promise<void> {
  const attempts = row.attempts + 1;
  await prisma.officeOutbox.update({
    where: { id: row.id },
    data: { attempts, nextAttemptAt: backoff(attempts), lastError: reason.slice(0, 500) },
  });

  // Тревога ровно один раз на строку — на пороге, а не на каждой попытке.
  // Гашение повторов между строками делает сам alertCrmSyncFailed.
  if (attempts === ALERT_AFTER) {
    audit({ action: 'office.outbox.stuck', target: row.refKey, meta: { attempts, reason } });
    inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'crm' });
    void alertCrmSyncFailed({ target: row.refKey, channel: channelOf(row.refKey), reason });
  }
}

async function markDropped(row: { id: number; refKey: string }, reason: string): Promise<void> {
  await prisma.officeOutbox.delete({ where: { id: row.id } });
  audit({ action: 'office.outbox.rejected', target: row.refKey, meta: { reason } });
  inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'crm' });
  void alertCrmSyncFailed({ target: row.refKey, channel: channelOf(row.refKey), reason });
}

/**
 * Отправить накопившееся. Никогда не бросает: её зовут из пути, где чек уже
 * пробит, и уронить ответ кассы из-за очереди было бы хуже задержки.
 *
 * Строки идут по одной и по порядку. На первой же сетевой неудаче проход
 * прекращается: офис лежит, и остальные упрутся в то же самое.
 */
export async function drainOffice(limit = BATCH): Promise<{ sent: number; pending: number }> {
  let sent = 0;
  try {
    const rows = await prisma.officeOutbox.findMany({
      where: { nextAttemptAt: { lte: new Date() } },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, topic: true, refKey: true, payload: true, attempts: true },
    });

    for (const row of rows) {
      const { verdict, reason } = await sendOne(row);

      if (verdict === 'done') {
        await prisma.officeOutbox.delete({ where: { id: row.id } });
        sent += 1;
        continue;
      }

      if (verdict === 'drop') {
        await markDropped(row, reason ?? 'офис отказал');
        continue;
      }

      await markRetry(row, reason ?? 'офис недоступен');
      break;
    }
  } catch (err) {
    console.error('[office] очередь зеркала не разобрана:', err);
  }

  const pending = await prisma.officeOutbox.count().catch(() => 0);
  return { sent, pending };
}
