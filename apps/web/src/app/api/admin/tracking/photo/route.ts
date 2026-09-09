import crypto from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { prisma } from '@repo/database';
import { actorOf, getSession } from '@/lib/adminAuth';
import { requireBotAuth } from '@/lib/botAuth';
import { localDayRange } from '@/lib/localDate';
import { audit } from '@/lib/audit';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';
import { getUploadsDir } from '@/lib/uploads';

// ══════════════════════════════════════════════════════════════════════
// Фотоотчёт с точки.
//
// ПОЧЕМУ НЕ `/api/upload`. Тот принимает что угодно до 100 МБ и кладёт как
// есть — он для товаров и вёрстки журнала. Здесь другое: кадр приходит с
// телефона (3–5 МБ), таких кадров десяток в день на человека, и хранить их
// в исходном размере значит за год съесть диск ради снимков витрины,
// которые смотрят на экране шириной в палец. Плюс кадр обязан быть
// привязан к стоянке, иначе «фотоотчёт за вторник» собрать не из чего.
// Общий загрузчик ни того, ни другого не делает и делать не должен.
//
// СЖАТИЕ НА ВХОДЕ, А НЕ ПРИ ПОКАЗЕ. Ужать при показе — значит уже принять
// оригинал на диск, то есть не решить задачу вовсе.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** Длинная сторона кадра после сжатия. */
const MAX_SIDE = 1600;

/** Качество JPEG. 78 — граница, за которой витрину на телефоне не отличить. */
const QUALITY = 78;

/**
 * Больше этого с телефона не приходит даже в HEIC без сжатия.
 *
 * Лимит стоит ДО чтения тела: пропустить стомегабайтный файл в память
 * ради того, чтобы отказать после, — это способ положить сервер.
 */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Открытая стоянка сотрудника по его Telegram.
 *
 * ЗАЧЕМ ВТОРАЯ ДВЕРЬ. Продавец шлёт боту геопозицию — и туда же
 * естественно шлёт фото с точки. Раньше кадр попадал в обработчик «рецепт
 * из холодильника» и возвращался рецептом, а владелец фотоотчёта не видел
 * вовсе. Дверь одна и та же, просто вход второй: бот называет себя общим
 * секретом и говорит, ЧЕЙ это Telegram, а какая у человека сейчас открыта
 * стоянка — решает сервер. Телу здесь верить нельзя ровно по той же
 * причине, по которой расстояние до клиента считает сервер.
 */
async function openStayOf(telegramId: bigint): Promise<{ id: number; customerId: number } | null> {
  const employee = await prisma.employee.findUnique({
    where: { telegramId },
    select: { id: true, isActive: true },
  });
  if (!employee || !employee.isActive) return null;

  const { start, end } = localDayRange();
  // Последняя незакрытая стоянка сегодня. Если человек отметил приезд к
  // двум клиентам и не закрыл первую, кадр логичнее отнести к той, где он
  // сейчас, — то есть к самой поздней.
  return prisma.trackStay.findFirst({
    where: {
      fieldDay: { employeeId: employee.id },
      leftAt: null,
      arrivedAt: { gte: start, lt: end },
    },
    select: { id: true, customerId: true },
    orderBy: { arrivedAt: 'desc' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    const bySession = session !== null && (session.role === 'ADMIN' || session.role === 'SELLER');
    const byBot = !bySession && requireBotAuth(request);
    if (!bySession && !byBot) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'Фото слишком большое' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const stayId = Number(form.get('stayId'));
    const rawRef = form.get('clientRef');
    const takenAtMs = Number(form.get('takenAt'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не выбран' }, { status: 400 });
    }

    // Стоянку называют номером из базы или ключом телефона: кадр, снятый в
    // подвале, уходит из очереди позже, и номера у него ещё нет — его
    // выдаёт сервер, до которого в момент съёмки не достучались. От бота
    // не приходит ни того ни другого: он знает только, чей это Telegram.
    const byId = Number.isInteger(stayId) && stayId > 0;
    const clientRef =
      typeof rawRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(rawRef) ? rawRef : null;

    const rawTg = form.get('telegramId');
    const tgText = typeof rawTg === 'string' ? rawTg : '';
    const byTelegram = byBot && /^\d{1,19}$/.test(tgText);

    if (!byId && !clientRef && !byTelegram) {
      return NextResponse.json({ error: 'Не указана стоянка' }, { status: 400 });
    }
    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'Фото слишком большое' }, { status: 400 });
    }

    // Стоянку проверяем ДО записи файла: кадр, привязанный к несуществующей
    // стоянке, лёг бы на диск навсегда и не показался бы никогда.
    const stay = byTelegram
      ? await openStayOf(BigInt(tgText))
      : await prisma.trackStay.findFirst({
          where: byId ? { id: stayId } : { clientRef },
          select: { id: true, customerId: true },
        });
    if (!stay) {
      // Для бота это не ошибка, а «человек сейчас не на точке»: тогда фото
      // — обычное сообщение, и его должен разобрать другой обработчик.
      return NextResponse.json(
        { error: byTelegram ? 'Нет открытой стоянки' : 'Стоянка не найдена' },
        { status: 404 },
      );
    }

    // Ориентацию применяем ЯВНО (`rotate()` без аргумента читает EXIF):
    // телефоны пишут кадр как есть и разворот держат в метаданных, а мы их
    // тут же и срезаем — иначе фото витрины уедет набок.
    //
    // Метаданные срезаются заодно и по существу: в EXIF лежат координаты
    // съёмки и модель телефона, а место мы храним своей колонкой, взятой
    // из проверенного источника, а не из файла, который прислал клиент.
    const input = Buffer.from(await file.arrayBuffer());
    let output: Buffer;
    let width = 0;
    let height = 0;
    try {
      const pipeline = sharp(input)
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY, mozjpeg: true });
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      output = data;
      width = info.width;
      height = info.height;
    } catch {
      // Не картинка или битый файл. Говорим прямо: человек стоит у точки и
      // ждёт, закроется визит или нет.
      return NextResponse.json({ error: 'Не удалось прочитать фото' }, { status: 400 });
    }

    const filename = `visit-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.jpg`;
    const uploadsDir = await getUploadsDir();
    await writeFile(path.join(uploadsDir, filename), output);

    // Время съёмки — из тела, но зажатое: кадр уходит из офлайн-очереди
    // спустя часы, и `now` соврал бы. Часы телефона при этом врут в обе
    // стороны, поэтому будущее не принимаем вовсе.
    const now = Date.now();
    const takenAt =
      Number.isFinite(takenAtMs) && takenAtMs > 0 && takenAtMs <= now
        ? new Date(takenAtMs)
        : new Date(now);

    const photo = await prisma.visitPhoto.create({
      data: {
        stayId: stay.id,
        imageUrl: `/uploads/${filename}`,
        width,
        height,
        bytes: output.length,
        takenAt,
      },
      select: { id: true, imageUrl: true, width: true, height: true, bytes: true },
    });

    audit({
      action: 'tracking.photo',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `stay#${stay.id} customer#${stay.customerId}`,
      meta: { bytes: output.length, from: input.length },
    });

    publish('customers');

    return NextResponse.json({ status: 'ok', photo });
  } catch (error: unknown) {
    console.error('API Admin Tracking Photo POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
