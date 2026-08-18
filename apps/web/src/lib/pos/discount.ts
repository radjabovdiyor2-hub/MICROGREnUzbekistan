import { lineTotal } from '@/lib/qty';
import type { PosDiscountInput } from './saleInput';

// ══════════════════════════════════════════════════════════════════════
// Скидка на весь чек — разносится по позициям.
//
// ПОЧЕМУ РАЗНОСИТСЯ, А НЕ ХРАНИТСЯ ОТДЕЛЬНО
//
// У чека нет строки-шапки в базе: он существует только как набор
// `stock_movements`, объединённых номером. Отдельного места под скидку нет,
// а выручка кассы считается ровно как `quantity × salePrice`
// (lib/revenue/salesLedger). Значит, уступка обязана попасть в `salePrice`,
// иначе отчёты покажут сумму ДО скидки — то есть деньги, которых не было.
//
// ПОЧЕМУ ФАКТИЧЕСКАЯ СКИДКА МОЖЕТ ОТЛИЧАТЬСЯ ОТ ЗАПРОШЕННОЙ
//
// Цена за единицу — целое число сумов, а количество дробное. Долю скидки,
// пришедшуюся на позицию, не всегда можно выразить целой ценой за единицу:
// «минус 1 000 сумов с 1.3 кг» — это 769.23 сума с килограмма. Мы округляем
// цену за единицу и ПЕРЕСЧИТЫВАЕМ фактическую скидку обратно.
//
// Возвращаемый `applied` — это то, что действительно произошло с деньгами,
// и именно он идёт в чек, в долг и в уведомление владельцу. Расхождение с
// запрошенным (единицы сумов) остаётся видимым, а не прячется: показать
// продавцу «скидка 1 000» и списать 998 было бы хуже любой погрешности.
//
// Минимальная цена за единицу — 1 сум. Ноль сделал бы движение неотличимым
// от списания в отчётах, где продажа опознаётся по наличию `salePrice`.
// ══════════════════════════════════════════════════════════════════════

export interface DiscountableLine {
  /** Цена за единицу до скидки на чек (уже с учётом уступки по позиции). */
  price: number;
  quantity: number;
}

export interface AllocatedLine {
  /** Цена за единицу после разнесения скидки — она уйдёт в `salePrice`. */
  price: number;
}

export interface Allocation {
  lines: AllocatedLine[];
  /** Сумма чека до скидки. */
  gross: number;
  /** Сколько просили скинуть. */
  requested: number;
  /** Сколько скинулось на самом деле — эта цифра идёт в чек. */
  applied: number;
  /** Сумма чека после скидки: `gross - applied`. */
  net: number;
}

const MIN_UNIT_PRICE = 1;

/** Сколько сумов просят скинуть с этой суммы. */
function requestedAmount(discount: PosDiscountInput, gross: number): number {
  const raw = discount.type === 'percent'
    ? Math.round((gross * discount.value) / 100)
    : Math.round(discount.value);
  return Math.max(0, Math.min(raw, gross));
}

/**
 * Разнести скидку чека по позициям.
 *
 * Без скидки возвращает исходные цены — вызывающему не нужно ветвиться.
 */
export function allocateDiscount(
  lines: DiscountableLine[],
  discount: PosDiscountInput | null,
): Allocation {
  const totals = lines.map((line) => lineTotal(line.price, line.quantity));
  const gross = totals.reduce((sum, value) => sum + value, 0);

  if (!discount || gross <= 0) {
    return {
      lines: lines.map((line) => ({ price: line.price })),
      gross, requested: 0, applied: 0, net: gross,
    };
  }

  const requested = requestedAmount(discount, gross);

  // Доли считаем пропорционально сумме позиции, а остаток от деления кладём
  // на последнюю: иначе сумма долей не сойдётся с запрошенной скидкой ещё
  // до всякого округления цены.
  const shares: number[] = [];
  let distributed = 0;
  for (let i = 0; i < totals.length; i += 1) {
    if (i === totals.length - 1) {
      shares.push(requested - distributed);
      break;
    }
    const share = Math.round((requested * totals[i]) / gross);
    shares.push(share);
    distributed += share;
  }

  const allocated = lines.map((line, i) => {
    const target = Math.max(0, totals[i] - shares[i]);
    const price = Math.max(MIN_UNIT_PRICE, Math.round(target / line.quantity));
    return { price };
  });

  const net = allocated.reduce(
    (sum, line, i) => sum + lineTotal(line.price, lines[i].quantity),
    0,
  );

  return { lines: allocated, gross, requested, applied: gross - net, net };
}
