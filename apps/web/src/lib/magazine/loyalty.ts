// ════════════════════════════════════════════════════════════
// Карта лояльности гостя (без регистрации, ключ — sessionId).
// Штамп — за снятый кадр блюда, максимум один в день. При достижении цели
// выдаётся промокод в магазин микрозелени.
//
// Логика вынесена сюда, чтобы её можно было покрыть тестом отдельно от
// HTTP-роута приёма кадра.
// ════════════════════════════════════════════════════════════
import { prisma } from '@repo/database';

export interface StampResult {
  stamps: number;
  goal: number;
  earnedToday: boolean;   // дали ли штамп сейчас (или уже был сегодня)
  rewardCode: string | null;
  rewardIssued: boolean;  // выдали ли награду именно этим вызовом
}

// Локальная дата ресторана в формате YYYY-MM-DD. Ташкент — UTC+5,
// без переходов на летнее время, поэтому фиксированный сдвиг корректен.
export function tashkentDay(now = new Date()): string {
  const shifted = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

// Уникальный код награды: FW-<slug>-<6 символов>.
function makeRewardCode(slug: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FW-${slug.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${rand}`;
}

interface RestaurantLoyalty {
  id: string;
  slug: string;
  loyaltyGoal: number | null;
  loyaltyRewardPercent: number | null;
}

/**
 * Начисляет штамп за сегодня (если ещё не начислен) и, при достижении цели,
 * выдаёт промокод. Идемпотентно в пределах дня.
 */
export async function awardStamp(
  restaurant: RestaurantLoyalty,
  sessionId: string,
  today = tashkentDay(),
): Promise<StampResult> {
  const goal = restaurant.loyaltyGoal ?? 5;
  const rewardPercent = restaurant.loyaltyRewardPercent ?? 15;

  const card = await prisma.loyaltyCard.upsert({
    where: { restaurantId_sessionId: { restaurantId: restaurant.id, sessionId } },
    update: {},
    create: { restaurantId: restaurant.id, sessionId, stamps: 0 },
  });

  // Штамп раз в день: повторный кадр сегодня прогресс не двигает
  const earnedToday = card.lastStampedOn !== today;
  let stamps = card.stamps;
  if (earnedToday) stamps += 1;

  let rewardCode = card.rewardCode;
  let rewardIssued = false;

  // Награда выдаётся один раз — при первом достижении цели
  if (stamps >= goal && !rewardCode) {
    const code = makeRewardCode(restaurant.slug);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await prisma.promoCode.create({
      data: {
        code,
        discountType: 'percent',
        value: rewardPercent,
        maxUses: 1,
        isActive: true,
        expiresAt,
      },
    });
    rewardCode = code;
    rewardIssued = true;
  }

  if (earnedToday || rewardIssued) {
    await prisma.loyaltyCard.update({
      where: { id: card.id },
      data: {
        stamps,
        ...(earnedToday ? { lastStampedOn: today } : {}),
        ...(rewardIssued ? { rewardCode } : {}),
      },
    });
  }

  return { stamps, goal, earnedToday, rewardCode, rewardIssued };
}

export async function loadCard(restaurantId: string, sessionId: string, goal: number, rewardPercent: number) {
  const card = await prisma.loyaltyCard.findUnique({
    where: { restaurantId_sessionId: { restaurantId, sessionId } },
  });
  return {
    stamps: card?.stamps ?? 0,
    goal,
    rewardPercent,
    rewardCode: card?.rewardCode ?? null,
  };
}
