import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { requireBotAuth } from '@/lib/botAuth';
import { readFreshFrame, saveFrame } from '@/lib/farm/frame';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Живой кадр с фермы: приём и выдача.
//
// ДВЕ РАЗНЫЕ ДВЕРИ В ОДНОМ ФАЙЛЕ.
//   POST — кладёт кадр. Закрыт общим секретом: снимать ферму имеет право
//          только то, что стоит на ферме, иначе на главной окажется
//          картинка любого, кто узнал адрес.
//   GET  — отдаёт кадр. Открыт всем: это витрина.
//
// ПОЧЕМУ ЧЕРЕЗ НАС, А НЕ ПРЯМО С КАМЕРЫ. Дать браузеру адрес камеры
// значило бы раздать её всем посетителям вместе с доступом: у камер один
// адрес и на просмотр, и на управление. Плюс заголовок безопасности сайта
// разрешает медиа только со своего домена — и правильно делает.
//
// СЖИМАЕМ НА ВХОДЕ, как и фотоотчёт с точки: кадр приходит раз в минуту,
// а смотрят его на экране шириной в палец. Хранить исходник значит платить
// диском и трафиком за то, чего не видно.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Длинная сторона кадра. Блок на главной не шире этого ни на одном экране. */
const MAX_SIDE = 1280;
const QUALITY = 72;

/** Больше этого на входе не принимаем: кадр с камеры столько не весит. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length === 0) {
      return NextResponse.json({ error: 'Пустой кадр' }, { status: 400 });
    }
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Кадр слишком большой' }, { status: 400 });
    }

    // Пропускаем через sharp не только ради размера: он же и проверяет,
    // что пришло изображение, а не что угодно с расширением .jpg.
    const jpeg = await sharp(raw)
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toBuffer();

    await saveFrame(jpeg);
    return NextResponse.json({ status: 'ok', bytes: jpeg.length });
  } catch (error: unknown) {
    console.error('API Farm Frame POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function GET() {
  const frame = await readFreshFrame();
  if (!frame) {
    // 404, а не пустая картинка: блок обязан понять, что показывать
    // нечего, и исчезнуть. Заглушка вместо кадра — это утверждение
    // «ферма выглядит так», которого мы делать не можем.
    return NextResponse.json({ error: 'Кадра нет' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(frame.bytes), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Ни секунды кэша: смысл кадра в том, что он текущий. Дата съёмки
      // уходит отдельным заголовком — по ней страница подписывает время.
      'Cache-Control': 'no-store, must-revalidate',
      'X-Frame-At': String(frame.at),
    },
  });
}

/**
 * Есть ли живой кадр — без самого кадра.
 *
 * Объявлен ЯВНО, а не оставлен на автоматику фреймворка: страница
 * спрашивает раз в минуту у каждого открытого браузера, и полагаться в
 * таком месте на «оно само» — значит однажды обнаружить, что оно качает
 * картинку целиком и молчит об этом.
 */
export async function HEAD() {
  const frame = await readFreshFrame();
  if (!frame) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, must-revalidate', 'X-Frame-At': String(frame.at) },
  });
}
