// ══════════════════════════════════════════════════════════════════════
// Единственный клиент ИИ-офиса (apps/tgas/web_office, FastAPI на 8050).
//
// Здесь собраны ОБА способа обращения к офису, потому что раньше их было
// три: этот модуль, lib/office.ts и сырой fetch прямо в роутах. Четыре
// файла делали одно и то же по-разному — каждый со своим таймаутом и
// своей трактовкой отказа, и один из них год выдавал недоступность офиса
// за успех, из-за чего «Пульт ИИ» молча не работал.
//
// Способа ровно два, и они отличаются НАМЕРЕННО:
//
//   officeFetch  — запрос-ответ для админки. Владелец ждёт результат,
//                  поэтому отказ обязан дойти до него как отказ.
//   notifyOffice — сигнал «выстрелил и забыл» с витрины. Покупатель не
//                  должен пострадать от того, что офис лежит, поэтому
//                  ошибка гасится и только пишется в лог.
//
// Третьего способа быть не должно. Нужен новый вызов — он идёт сюда.
// ══════════════════════════════════════════════════════════════════════

const OFFICE_URL =
  process.env.TGAS_OFFICE_URL || process.env.WEB_OFFICE_URL || 'http://localhost:8050';

export interface OfficeResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Запрос-ответ к офису. Отказ возвращается честно: вызывающий роут обязан
 * передать его наружу, а не подменять пустым результатом или заглушкой.
 */
export async function officeFetch<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<OfficeResult<T>> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OFFICE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
        ...(rest.headers ?? {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => null)) as T | null;

    if (!res.ok) {
      const err = (data as { error?: string } | null)?.error;
      return { ok: false, status: res.status, data, error: err || `ИИ-офис ответил ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error(`[office] ${path} не удался:`, error);
    return {
      ok: false,
      status: 504,
      data: null,
      error: aborted
        ? 'ИИ-офис не ответил вовремя'
        : 'ИИ-офис недоступен. Проверьте контейнер mg_web_office',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Сигналы с витрины ─────────────────────────────────────────────────
// Каждое действие покупателя (регистрация, жалоба, B2B-заявка, отзыв)
// зеркалится в офис, чтобы Стёпан, продажи, поддержка и аналитика на него
// среагировали. Витрина при этом не должна ломаться, если офис лежит.

/**
 * Адрес приёмника сигнала. Порядок: явная переменная под суффикс, затем
 * вывод из OFFICE_INGEST_URL, затем общий адрес офиса. Последняя ступень
 * добавлена при слиянии: раньше при заданном только WEB_OFFICE_URL
 * сигналы молча никуда не уходили.
 */
/**
 * Исторические имена переменных.
 *
 * Общее правило даёт `OFFICE_ORDER_STATUS_URL`, а на проде переменная
 * называется `OFFICE_STATUS_URL` — без «ORDER». Пока статусы уходили
 * собственным кодом, это было его личным делом; после переезда на общую
 * очередь правило перестало бы её видеть, и явно заданный адрес молча
 * заменился бы выведенным. На проде они совпадают, но полагаться на такое
 * совпадение — значит однажды получить синхронизацию не туда.
 */
const LEGACY_ENV: Record<string, string> = {
  'order-status': 'OFFICE_STATUS_URL',
};

export function ingestUrl(suffix: string): string {
  const explicit =
    process.env[`OFFICE_${suffix.toUpperCase().replace(/-/g, '_')}_URL`] ||
    process.env[LEGACY_ENV[suffix] ?? ''];
  if (explicit) return explicit;

  const derived = process.env.OFFICE_INGEST_URL?.replace(/\/order$/, `/${suffix}`);
  if (derived) return derived;

  return `${OFFICE_URL}/ingest/${suffix}`;
}

async function postOffice(suffix: string, body: unknown): Promise<void> {
  try {
    await fetch(ingestUrl(suffix), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    // Намеренно гасим: заказ или регистрация уже прошли, и падение офиса
    // не повод отказать покупателю. Но в лог это обязано попасть.
    console.error(`[office] сигнал ${suffix} не доставлен (запрос покупателя выполнен):`, err);
  }
}

/**
 * Каталог витрины изменился — офису пора обновить своё зеркало.
 *
 * ЗАЧЕМ ЭТОТ СИГНАЛ СУЩЕСТВУЕТ
 *
 * Зеркало `crm_products` наполняет фоновая петля офиса, и её период —
 * ТРИДЦАТЬ МИНУТ (`web_office/main.py`, `_catalog_sync_loop`). То есть цена,
 * изменённая владельцем в админке, доезжала до прайса ботов в среднем через
 * пятнадцать минут, а в худшем случае через полчаса: продавец называл клиенту
 * вчерашнюю цену, ничего не нарушая.
 *
 * Дверь для внепланового синка у офиса уже была (`POST /admin/sync-catalog`,
 * закрыта тем же `INGEST_SECRET`) — её просто никто не дёргал, кроме кнопки
 * в «Пульте ИИ». Теперь её дёргает сама витрина, сразу после записи.
 *
 * Петля остаётся страховкой: изменения мимо API (сидер, ручной SQL,
 * восстановление из бэкапа) сигнала не порождают, и подобрать их может только
 * периодический проход.
 */
export async function notifyOfficeCatalog(): Promise<void> {
  // Короткий таймаут: это уведомление, а не запрос-ответ. Офис на нём
  // запускает свой синк и отвечает уже результатом — ждать его витрине
  // незачем, ей важно только, что сигнал ушёл.
  const res = await officeFetch('/admin/sync-catalog', { method: 'POST', timeoutMs: 4000 });
  if (!res.ok) {
    console.error('[office] синк каталога не запущен:', res.error);
  }
}

/** Регистрация или обновление клиента в CRM офиса (signup / первый вход). */
export async function notifyOfficeCustomer(user: {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  telegramId?: bigint | number | string | null;
  bonusPoints?: number | null;
  language?: string | null;
}): Promise<void> {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
  await postOffice('customer', {
    name,
    phone: user.phone ?? null,
    telegram_id: user.telegramId ? user.telegramId.toString() : null,
    bonus_balance: user.bonusPoints ?? 0,
    language: user.language ?? 'ru',
    // Связка Customer(CRM) ↔ User(витрина). Её передавал только путь заказа
    // (lib/orders/notify.ts), а этот — нет, хотя id был под рукой. До первого
    // заказа клиент оставался двумя несвязанными карточками, и сопоставить их
    // потом можно было лишь по телефону или имени — самым шатким ключам.
    // По этой же связке админка начисляет бонусы (lib/customers/bonus.ts).
    web_user_id: user.id ?? null,
  });
}

/** Обращение или жалоба покупателя — поддержке офиса (PM заводит срочную задачу). */
export async function notifyOfficeSupport(input: {
  name?: string | null;
  phone?: string | null;
  telegramId?: bigint | number | string | null;
  message: string;
}): Promise<void> {
  await postOffice('support', {
    name: input.name ?? null,
    phone: input.phone ?? null,
    telegram_id: input.telegramId ? input.telegramId.toString() : null,
    message: input.message,
  });
}

/** B2B-заявка с сайта — в воронку продаж офиса. */
export async function notifyOfficeLead(input: {
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  message?: string | null;
}): Promise<void> {
  await postOffice('lead', {
    company_name: input.companyName ?? null,
    contact_name: input.contactName ?? null,
    phone: input.phone ?? null,
    message: input.message ?? null,
  });
}

/** Отзыв о товаре — в офис (аналитика и Стёпан видят тональность). */
export async function notifyOfficeFeedback(input: {
  name?: string | null;
  telegramId?: bigint | number | string | null;
  product?: string | null;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  await postOffice('feedback', {
    name: input.name ?? null,
    telegram_id: input.telegramId ? input.telegramId.toString() : null,
    product: input.product ?? null,
    rating: input.rating,
    comment: input.comment ?? null,
  });
}
