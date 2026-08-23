import { getSession } from '@/lib/adminAuth';
import { startOfLocalDay } from '@/lib/localDate';
import { SELLER_BACKDATE_DAYS } from './rules';
import { isValidQty, normalizeQty } from '@/lib/qty';
import type { SessionRole } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// Разбор и проверка тела чека. Вынесено из sale.ts: там осталась запись
// в базу, а здесь — всё, что решает, можно ли её делать.
//
// Раньше проверок не было вовсе: `sale.ts` брал `items`, `performedBy` и
// `paymentMethod` из тела как есть. Пока чек всегда означал «сейчас и мной»,
// это сходило с рук. Деловая дата и авторство превращают тело запроса в то,
// чем можно подделать выручку закрытого дня и чужую смену, поэтому оба поля
// теперь сверяются с подписанной сессией, а не с тем, что прислал браузер.
// ══════════════════════════════════════════════════════════════════════

/** Запас на расхождение часов клиента и сервера — но не на «завтра». */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface PosSaleItemInput {
  productId: string;
  quantity: number;
  price: number;
  /** Почему цена отличается от прайсовой. Обязательна, если отличается. */
  priceReason?: string;
}

export interface PosDiscountInput {
  type: 'percent' | 'fixed';
  value: number;
  reason: string;
}

export interface PosDebtInfo {
  personName: string;
  phone?: string;
  dueDate?: string;
  description?: string;
}

export interface ParsedSale {
  items: PosSaleItemInput[];
  paymentMethod: 'cash' | 'card' | 'debt';
  performedBy: string;
  role: SessionRole;
  /** Деловая дата операции — она же дата в номере чека. */
  soldAt: Date;
  /** Продажа проведена задним числом: дату назвали явно. */
  backdated: boolean;
  backdateReason: string | null;
  discount: PosDiscountInput | null;
  debtInfo: PosDebtInfo | null;
  /** Покупатель чека: договорная цена, история продаж и связь с CRM. */
  customerId: number | null;
  /** Где продали: за прилавком или с выезда по карте. */
  origin: 'counter' | 'field';
  /**
   * Ключ идемпотентности от браузера. `null` — чек пришёл без него.
   *
   * Тот же ключ на повторе означает ТОТ ЖЕ чек, а не второй: двойное
   * нажатие «Продать» на плохой сети и повторная отправка из офлайн-очереди
   * раньше списывали товар дважды.
   */
  clientKey: string | null;
}

export type ParseResult =
  | { ok: true; sale: ParsedSale }
  | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): ParseResult => ({ ok: false, error, status });

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Кто и с какими правами оформляет чек.
 *
 * Роль берётся из подписанной cookie, а не из тела. Бот/офис ходят сюда с
 * общим секретом и своей сессии не имеют — им отдаём ADMIN: у них уже есть
 * право создавать заказы по договорной цене (см. lib/orders/create.ts).
 */
function identify(request: Request): { role: SessionRole; name: string } {
  const session = getSession(request);
  if (session && session.role !== 'CUSTOMER') {
    return { role: session.role, name: session.name?.trim() || 'Egasi' };
  }
  return { role: 'ADMIN', name: 'Egasi' };
}

/** Самая ранняя допустимая деловая дата для роли. */
function earliestSoldAt(role: SessionRole, now: Date): Date | null {
  if (role === 'ADMIN') return null;
  const limit = startOfLocalDay(now);
  limit.setDate(limit.getDate() - SELLER_BACKDATE_DAYS);
  return limit;
}

export function parseSale(request: Request, body: unknown): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const { role, name } = identify(request);
  const now = new Date();

  // ── Позиции ────────────────────────────────────────────────────────
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (rawItems.length === 0) return fail("Tovarlar ro'yxati bo'sh");

  const items: PosSaleItemInput[] = [];
  for (const entry of rawItems as Record<string, unknown>[]) {
    const productId = asString(entry.productId);
    if (!productId) return fail('Tovar tanlanmagan');

    // Проверяем ИСХОДНОЕ значение, а не нормализованное: normalizeQty(1.234)
    // даёт 1.23, и проверка после неё пропустила бы лишний знак, молча
    // округлив количество. Тихое округление количества — это тихое
    // расхождение чека со складом.
    const rawQuantity = Number(entry.quantity);
    if (!isValidQty(rawQuantity)) return fail(`Miqdor noto'g'ri: ${String(entry.quantity)}`);
    const quantity = normalizeQty(rawQuantity);

    const price = Number(entry.price);
    if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
      return fail(`Narx noto'g'ri: ${String(entry.price)}`);
    }

    items.push({ productId, quantity, price, priceReason: asString(entry.priceReason) || undefined });
  }

  // ── Способ оплаты ──────────────────────────────────────────────────
  const paymentMethod = asString(raw.paymentMethod) || 'cash';
  if (paymentMethod !== 'cash' && paymentMethod !== 'card' && paymentMethod !== 'debt') {
    return fail(`Toʻlov usuli notoʻgʻri: ${paymentMethod}`);
  }

  const debtInfoRaw = (raw.debtInfo ?? null) as Record<string, unknown> | null;
  if (paymentMethod === 'debt' && !asString(debtInfoRaw?.personName)) {
    return fail("Qarzga sotishda ism majburiy");
  }

  // ── Деловая дата ───────────────────────────────────────────────────
  const soldAtRaw = asString(raw.soldAt);
  let soldAt = now;
  let backdated = false;
  let backdateReason: string | null = null;

  if (soldAtRaw) {
    const parsed = new Date(soldAtRaw);
    if (Number.isNaN(parsed.getTime())) return fail(`Sana noto'g'ri: ${soldAtRaw}`);

    // Будущее запрещено всем, включая владельца: продажа, которой ещё не
    // было, — это не отчёт, а прогноз, и в выручке ему делать нечего.
    if (parsed.getTime() > now.getTime() + FUTURE_SKEW_MS) {
      return fail("Kelajakdagi sana bilan sotib bo'lmaydi");
    }

    const earliest = earliestSoldAt(role, now);
    if (earliest && parsed.getTime() < earliest.getTime()) {
      return fail(
        `Sotuvchi ${SELLER_BACKDATE_DAYS} kundan eskisini kirita olmaydi. Egasiga murojaat qiling.`,
        403,
      );
    }

    // Дата без причины бесполезна: через месяц никто не вспомнит, почему
    // выручка закрытого дня выросла.
    backdateReason = asString(raw.backdateReason);
    if (backdateReason.length < 3) {
      return fail('Orqaga sana uchun sabab majburiy (kamida 3 belgi)');
    }

    soldAt = parsed;
    backdated = true;
  }

  // ── Кто продал ─────────────────────────────────────────────────────
  //
  // Имя приходило строкой из тела, и продавец мог подписать чек чужим.
  // Теперь оно берётся из сессии, а из тела принимается только у владельца —
  // это и есть режим «владелец заносит продажу за продавца».
  const claimed = asString(raw.performedBy);
  const performedBy = role === 'ADMIN' && claimed ? claimed : name;

  // ── Скидка на весь чек ─────────────────────────────────────────────
  let discount: PosDiscountInput | null = null;
  const discountRaw = (raw.discount ?? null) as Record<string, unknown> | null;
  if (discountRaw && Number(discountRaw.value) > 0) {
    const type = asString(discountRaw.type) === 'fixed' ? 'fixed' : 'percent';
    const value = Number(discountRaw.value);
    if (!Number.isFinite(value) || value <= 0) return fail("Chegirma noto'g'ri");
    if (type === 'percent' && value > 100) return fail("Chegirma 100% dan katta bo'lmaydi");

    const reason = asString(discountRaw.reason);
    if (reason.length < 3) return fail('Chegirma uchun sabab majburiy (kamida 3 belgi)');

    discount = { type, value, reason };
  }

  // Покупателя принимаем только как число: он попадает во внешний ключ
  // шапки чека, и мусор оттуда уронил бы продажу целиком.
  const customerIdRaw = Number(raw.customerId);
  const customerId = Number.isInteger(customerIdRaw) && customerIdRaw > 0 ? customerIdRaw : null;

  // Место продажи — закрытый список из двух значений. Неизвестное отвергаем,
  // а не приводим к прилавку молча: `origin` уходит в адрес зеркала CRM, и
  // выезд к ресторану, записанный «продажей в магазине», врёт дважды.
  const originRaw = asString(raw.origin);
  if (originRaw && originRaw !== 'counter' && originRaw !== 'field') {
    return fail(`Sotuv joyi noto'g'ri: ${originRaw}`);
  }
  const origin = originRaw === 'field' ? 'field' : 'counter';

  // Ключ идемпотентности. Длину режем: он идёт в уникальную колонку
  // VarChar(64), и строка длиннее уронила бы вставку самого чека.
  const clientKeyRaw = asString(raw.clientKey);
  if (clientKeyRaw.length > 64) return fail('clientKey juda uzun');
  const clientKey = clientKeyRaw || null;

  return {
    ok: true,
    sale: {
      items,
      customerId,
      origin,
      clientKey,
      paymentMethod,
      performedBy,
      role,
      soldAt,
      backdated,
      backdateReason,
      discount,
      debtInfo: debtInfoRaw
        ? {
            personName: asString(debtInfoRaw.personName),
            phone: asString(debtInfoRaw.phone) || undefined,
            dueDate: asString(debtInfoRaw.dueDate) || undefined,
          }
        : null,
    },
  };
}
