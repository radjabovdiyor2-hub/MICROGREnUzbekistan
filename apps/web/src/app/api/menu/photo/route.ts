// ════════════════════════════════════════════════════════════
// POST /api/menu/photo — кадр гостя из «Живого меню».
// Публичный роут: гость не регистрируется, идентификация — sessionId.
// Кадр уходит в модерацию, потому что одобренные печатаются в номере.
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { saveUpload } from '@/lib/uploads';
import { awardStamp } from '@/lib/magazine/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });

  const file = form.get('file');
  const slug = String(form.get('slug') ?? '');
  const sessionId = String(form.get('sessionId') ?? '');
  // Кадр публикуется в печати и на витрине — без явного согласия не принимаем
  const consent = String(form.get('consent') ?? '') === 'true';

  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!slug || !sessionId) return NextResponse.json({ error: 'slug and sessionId required' }, { status: 400 });
  if (!consent) return NextResponse.json({ error: 'consent required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Файл слишком большой' }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });

  const dishCode = Number(form.get('dishCode'));
  const dish = Number.isFinite(dishCode)
    ? await prisma.dish.findUnique({
        where: { restaurantId_code: { restaurantId: restaurant.id, code: dishCode } },
      })
    : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageUrl = await saveUpload(buffer, `guest-${restaurant.slug ?? restaurant.id}`, 'jpg');

  const photo = await prisma.guestPhoto.create({
    data: {
      restaurantId: restaurant.id,
      dishId: dish?.id ?? null,
      guestName: (form.get('guestName') as string) || null,
      guestHandle: (form.get('guestHandle') as string) || null,
      imageUrl,
      consent: true,
      sessionId,
    },
  });

  await prisma.magazineEvent.create({
    data: { type: 'photo_submitted', slug, dishId: dish?.id ?? null, sessionId },
  });

  // Штамп в карту лояльности за кадр (1/день). Ошибку глотаем — она не должна
  // ломать отправку кадра, ради которой гость и пришёл.
  let stamp: Awaited<ReturnType<typeof awardStamp>> | null = null;
  try {
    stamp = await awardStamp(
      { id: restaurant.id, slug: restaurant.slug ?? restaurant.id, loyaltyGoal: restaurant.loyaltyGoal, loyaltyRewardPercent: restaurant.loyaltyRewardPercent },
      sessionId,
    );
    if (stamp.earnedToday) {
      await prisma.magazineEvent.create({ data: { type: 'stamp_earned', slug, sessionId } });
    }
    if (stamp.rewardIssued) {
      await prisma.magazineEvent.create({ data: { type: 'reward_issued', slug, sessionId } });
    }
  } catch {
    // лояльность не критична для приёма кадра
  }

  return NextResponse.json({
    id: photo.id,
    imageUrl,
    loyalty: stamp ? { stamps: stamp.stamps, goal: stamp.goal, rewardCode: stamp.rewardCode } : null,
  });
}
