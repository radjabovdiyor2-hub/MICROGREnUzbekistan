import { prisma } from '@repo/database';

import { isCompanyType } from './companyTypes';
import { metersBetween } from './visitProof';

// ══════════════════════════════════════════════════════════════════════
// Завести клиента прямо с карты, стоя у его дверей.
//
// ЗАЧЕМ. Продавец ходит по улице и видит заведение, которого в базе нет.
// До сих пор он мог только запомнить его и завести вечером — то есть по
// памяти, без адреса и без координаты. Половина таких так и не заводилась.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ ВЕТКА В РОУТЕ. Здесь живёт защита от
// дублей, и она не сводится к «проверить имя»: одно и то же заведение в
// поле заводят как «Плов Центр», «Плов-центр» и «ПЛОВЦЕНТР», зато стоит
// оно всегда на одном месте.
// ══════════════════════════════════════════════════════════════════════

/**
 * На каком расстоянии считаем, что это то же самое заведение.
 *
 * 60 метров — примерно длина здания. Ближе стоят разве что соседние
 * заведения в одном торговом центре, и на такой случай дубль не блокируется
 * намертво: человеку показывают найденное и дают решить самому.
 */
export const SAME_PLACE_METERS = 60;

// Поля НЕ необязательные, а нулевые: разбор заполняет каждое, и
// `undefined` здесь означал бы «не знаем, спрашивали ли» — лишнее
// третье состояние, из-за которого проверка `!== null` не сужает тип.
export interface FieldCustomerInput {
  name: string;
  phone: string | null;
  companyType: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  /** Точность позиции телефона, метры: пин честнее, когда видно, чем поставлен. */
  accuracyM: number | null;
}

export interface NearbyDuplicate {
  id: number;
  name: string;
  distanceM: number;
}

/**
 * Есть ли по этим координатам уже заведённый клиент.
 *
 * Выборка идёт грубой рамкой по широте и долготе, а расстояние считается
 * потом: индекса по паре координат в схеме нет намеренно (b-tree по паре
 * бесполезен для «рядом»), и рамка — самый дешёвый способ не тащить всю
 * таблицу.
 */
export async function findNearbyCustomer(
  latitude: number,
  longitude: number,
  radiusM: number = SAME_PLACE_METERS,
): Promise<NearbyDuplicate | null> {
  // Запас рамки: 0.001° широты ≈ 111 м, долготы на широте Самарканда ≈ 85 м.
  // Берём с избытком и отсекаем расстоянием — рамка обязана быть шире круга,
  // иначе на её углах дубль проскочит.
  const delta = (radiusM / 1000 / 85) * 1.5;

  const near = await prisma.customer.findMany({
    where: {
      latitude: { gte: latitude - delta, lte: latitude + delta },
      longitude: { gte: longitude - delta, lte: longitude + delta },
    },
    select: { id: true, name: true, companyName: true, latitude: true, longitude: true },
    take: 50,
  });

  let best: NearbyDuplicate | null = null;
  for (const c of near) {
    if (c.latitude === null || c.longitude === null) continue;
    const m = metersBetween({ latitude, longitude }, { latitude: c.latitude, longitude: c.longitude });
    if (m > radiusM) continue;
    if (best && best.distanceM <= m) continue;
    best = { id: c.id, name: c.companyName || c.name || `#${c.id}`, distanceM: m };
  }
  return best;
}

/** Разбор тела запроса. Возвращает либо готовые данные, либо причину отказа. */
export function parseFieldCustomer(
  body: unknown,
): { ok: true; value: FieldCustomerInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2) return { ok: false, error: 'Название нужно — по нему клиента ищут' };
  if (name.length > 255) return { ok: false, error: 'Название длиннее 255 символов' };

  const lat = Number(b.latitude);
  const lon = Number(b.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  if (hasCoords && (lat < -90 || lat > 90 || lon < -180 || lon > 180)) {
    return { ok: false, error: 'Координаты вне диапазона' };
  }

  const companyType = typeof b.companyType === 'string' ? b.companyType : '';
  if (companyType && !isCompanyType(companyType)) {
    return { ok: false, error: 'Неизвестный тип заведения' };
  }

  const acc = Number(b.accuracyM);

  return {
    ok: true,
    value: {
      name,
      phone: typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim().slice(0, 20) : null,
      companyType: companyType || null,
      latitude: hasCoords ? lat : null,
      longitude: hasCoords ? lon : null,
      address: typeof b.address === 'string' && b.address.trim() ? b.address.trim() : null,
      accuracyM: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null,
    },
  };
}

/**
 * Как записывается заведённый в поле клиент.
 *
 * `status: 'lead'` — это ещё не клиент, а увиденная дверь. `source: 'field'`
 * отличает его от импорта справочников и от регистрации на витрине: по нему
 * видно, что заведение нашли ногами.
 *
 * `geoSource: 'manual'` защищает координату от ночного геокодера: он не
 * должен переставлять пин, поставленный человеком, который там стоял.
 */
export function fieldCustomerData(input: FieldCustomerInput) {
  const placed = input.latitude !== null && input.longitude !== null;

  return {
    name: input.name,
    phone: input.phone,
    companyName: input.name,
    companyType: input.companyType,
    // Заведение — это B2B: продавец ходит по ресторанам и кафе, а не по
    // частным квартирам.
    customerType: 'b2b',
    status: 'lead',
    source: 'field',
    address: input.address,
    ...(placed
      ? {
          latitude: input.latitude,
          longitude: input.longitude,
          geoSource: 'manual',
          geoPrecision: 'exact',
          geocodedAt: new Date(),
        }
      : {}),
  };
}
