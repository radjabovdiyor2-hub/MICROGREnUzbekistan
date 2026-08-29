import { channelOrderSchema, type ChannelOrderInput } from '../orderSchema';

// ══════════════════════════════════════════════════════════════════════
// Адаптеры каналов: чужое тело заказа → канонический вид.
//
// Ни у Uzum, ни у агрегаторов доставки нет открытой документации на
// вебхук заказа: формат выдаётся вместе с договором. Поэтому разбора
// конкретных площадок здесь пока НЕТ — и это не заглушка, а отказ
// выдумывать. Придуманный разбор прошёл бы код-ревью, лёг бы в прод и
// сломался на первом настоящем заказе, когда чинить его будет некому.
//
// Пока формат не получен, интегратор (или наш прокси) присылает
// канонический вид — он описан в `orderSchema.ts`. Появится настоящий
// формат — добавляется функция в `TRANSFORMS`, и меняется ровно одна
// строка на канал.
// ══════════════════════════════════════════════════════════════════════

type Transform = (raw: unknown) => unknown;

/** Разбор тела конкретной площадки. Пусто = ждём канонический вид. */
const TRANSFORMS: Record<string, Transform> = {};

export type NormalizeResult =
  | { ok: true; order: ChannelOrderInput }
  | { ok: false; error: string; details?: unknown };

export function normalizeChannelBody(code: string, raw: unknown): NormalizeResult {
  const transform = TRANSFORMS[code];
  const candidate = transform ? transform(raw) : raw;

  const parsed = channelOrderSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Тело заказа не соответствует контракту канала',
      details: parsed.error.issues,
    };
  }
  return { ok: true, order: parsed.data };
}
