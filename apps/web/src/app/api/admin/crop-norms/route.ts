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
    include: { substrateMaterial: { select: { id: true, name: true, unit: true } } },
  });

  // Список субстратов отдаём вместе с нормами: форма должна дать выбрать
  // конкретный, а не полагаться на «первый попавшийся».
  const substrates = await prisma.rawMaterial.findMany({
    where: { kind: 'SUBSTRATE', isActive: true },
    select: { id: true, name: true, unit: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    status: 'ok',
    substrates,
    norms: norms.map((n) => ({
      id: n.id,
      cropType: n.cropType,
      nameRu: n.nameRu,
      plantingUnit: n.plantingUnit,
      seedUnit: n.seedUnit,
      seedPerUnit: Number(n.seedPerUnit),
      substratePerUnit: dec(n.substratePerUnit),
      substrateMaterialId: n.substrateMaterialId,
      substrateMaterialName: n.substrateMaterial?.name ?? null,
      traysPerBatch: dec(n.traysPerBatch),
      packagingPerUnit: dec(n.packagingPerUnit),
      yieldPerUnit: dec(n.yieldPerUnit),
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
  const seedPerUnit = Number(body.seedPerUnit);
  if (!cropType) return NextResponse.json({ error: 'Укажите культуру' }, { status: 400 });

  const plantingUnit = body.plantingUnit === 'cup' ? 'cup' : 'tray';
  const unitWord = plantingUnit === 'cup' ? 'стаканчик' : 'лоток';

  if (!Number.isFinite(seedPerUnit) || seedPerUnit <= 0) {
    return NextResponse.json(
      { error: `Укажите расход семян на ${unitWord} — без него посадка не спишет сырьё` },
      { status: 400 },
    );
  }

  const optional = (v: unknown) =>
    v == null || v === '' ? null : new Prisma.Decimal(Number(v) || 0);

  // Субстрат обязателен, если задана его норма: иначе посадка снова начнёт
  // выбирать «первый попавшийся», ради чего привязка и заведена.
  const substrateMaterialId = body.substrateMaterialId
    ? String(body.substrateMaterialId)
    : null;
  const substratePerUnit = optional(body.substratePerUnit);
  if (substratePerUnit && Number(substratePerUnit) > 0 && !substrateMaterialId) {
    return NextResponse.json(
      { error: 'Указан расход субстрата — выберите, какой именно субстрат списывать' },
      { status: 400 },
    );
  }

  const data = {
    nameRu: String(body.nameRu ?? cropType).slice(0, 100),
    plantingUnit,
    seedUnit: body.seedUnit === 'pcs' ? 'pcs' : 'g',
    seedPerUnit: new Prisma.Decimal(seedPerUnit),
    substratePerUnit,
    substrateMaterialId,
    // Стаканчики лотков не расходуют: без явного нуля посадка 250 стаканчиков
    // списала бы 250 лотков — у поля дефолт 1.
    traysPerBatch: new Prisma.Decimal(
      body.traysPerBatch == null || body.traysPerBatch === ''
        ? plantingUnit === 'cup'
          ? 0
          : 1
        : Math.max(0, Number(body.traysPerBatch) || 0),
    ),
    packagingPerUnit: optional(body.packagingPerUnit),
    yieldPerUnit: optional(body.yieldPerUnit),
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
 * PATCH — поправить ТОЛЬКО длительности фаз.
 *
 * Отдельно от POST намеренно: тот делает полный upsert и требует расход
 * семян. Прислать в него `{cropType, darkDays}` значило бы обнулить и
 * субстрат, и выход, и привязку материала — то есть сломать себестоимость
 * будущих посадок ради правки одного числа.
 *
 * Нужен, когда партия вышла из темноты раньше норматива: админка предлагает
 * закрепить факт в справочнике, и менять при этом можно ровно то, что
 * человек увидел своими глазами.
 */
export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });

  const cropType = String(body.cropType ?? '').trim();
  if (!cropType) return NextResponse.json({ error: 'Укажите культуру' }, { status: 400 });

  const data: Record<string, number> = {};
  for (const field of ['darkDays', 'lightDays', 'shelfDays'] as const) {
    if (body[field] == null) continue;
    const n = Math.floor(Number(body[field]));
    if (Number.isFinite(n) && n >= 0) data[field] = n;
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  try {
    const norm = await prisma.cropNorm.update({ where: { cropType }, data });
    return NextResponse.json({ status: 'ok', norm });
  } catch {
    return NextResponse.json({ error: 'Такой культуры нет в справочнике' }, { status: 404 });
  }
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
