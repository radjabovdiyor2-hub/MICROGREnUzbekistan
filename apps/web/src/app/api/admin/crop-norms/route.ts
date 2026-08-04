import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Нормы культур: сколько сырья уходит на лоток и сколько с него снимают.
//
// Раньше справочник культур (CROP_DB) жил константой во фронтенде и знал
// только длительности фаз. Норм расхода не было вовсе — поэтому посадка не
// могла ни списать семена, ни посчитать себестоимость. Теперь это таблица,
// которую владелец правит из админки: расход зависит от партии семян и
// сезона, менять его через выкладку кода бессмысленно.
// ══════════════════════════════════════════════════════════════════════

const dec = (v: Prisma.Decimal | number | null) => (v == null ? null : Number(v));

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const norms = await prisma.cropNorm.findMany({
    where: { isActive: true },
    orderBy: { nameRu: 'asc' },
  });

  return NextResponse.json({
    status: 'ok',
    norms: norms.map((n) => ({
      id: n.id,
      cropType: n.cropType,
      nameRu: n.nameRu,
      seedGramsPerTray: Number(n.seedGramsPerTray),
      substrateGramsPerTray: dec(n.substrateGramsPerTray),
      packagingPerTray: dec(n.packagingPerTray),
      yieldPerTray: dec(n.yieldPerTray),
      darkDays: n.darkDays,
      lightDays: n.lightDays,
      shelfDays: n.shelfDays,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });

  const cropType = String(body.cropType ?? '').trim();
  const seedGrams = Number(body.seedGramsPerTray);
  if (!cropType) return NextResponse.json({ error: 'Укажите культуру' }, { status: 400 });
  if (!Number.isFinite(seedGrams) || seedGrams <= 0) {
    return NextResponse.json(
      { error: 'Укажите расход семян на лоток — без него посадка не спишет сырьё' },
      { status: 400 },
    );
  }

  const optional = (v: unknown) =>
    v == null || v === '' ? null : new Prisma.Decimal(Number(v) || 0);

  const data = {
    nameRu: String(body.nameRu ?? cropType).slice(0, 100),
    seedGramsPerTray: new Prisma.Decimal(seedGrams),
    substrateGramsPerTray: optional(body.substrateGramsPerTray),
    packagingPerTray: optional(body.packagingPerTray),
    yieldPerTray: optional(body.yieldPerTray),
    darkDays: Math.max(0, Math.floor(Number(body.darkDays) || 3)),
    lightDays: Math.max(0, Math.floor(Number(body.lightDays) || 6)),
    shelfDays: Math.max(0, Math.floor(Number(body.shelfDays) || 5)),
    isActive: true,
  };

  // upsert: справочник правят чаще, чем заводят. Отдельная кнопка «создать»
  // и «изменить» здесь только мешала бы.
  const norm = await prisma.cropNorm.upsert({
    where: { cropType },
    update: data,
    create: { cropType, ...data },
  });

  return NextResponse.json({ status: 'ok', norm });
}

/**
 * DELETE — скрыть культуру из справочника.
 *
 * Скрытие, а не удаление: `RawMaterial.cropType` и `GrowBatch.cropType` —
 * обычные строки, а не внешние ключи. Физическое удаление ничего не сломает
 * на уровне базы, но осиротит эти ссылки: у старых партий пропадёт норма, по
 * которой считалась их себестоимость, и объяснить цифру станет нечем.
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const cropType = new URL(request.url).searchParams.get('cropType');
  if (!cropType) return NextResponse.json({ error: 'Нужна культура' }, { status: 400 });

  const inUse = await prisma.rawMaterial.count({
    where: { cropType, isActive: true },
  });
  if (inUse > 0) {
    return NextResponse.json({
      error:
        `На складе есть позиции сырья с этой культурой (${inUse}) — ` +
        `сначала скройте их, иначе посадка перестанет находить семена.`,
    }, { status: 409 });
  }

  try {
    await prisma.cropNorm.update({ where: { cropType }, data: { isActive: false } });
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Культура не найдена' }, { status: 404 });
  }
}
