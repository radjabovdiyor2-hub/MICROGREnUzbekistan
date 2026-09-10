import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { requireBotAuth } from '@/lib/botAuth';
import { captureFrame, readConfig } from '@/lib/farm/ezviz';
import { saveFrame } from '@/lib/farm/frame';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Снять кадр с камеры через облако EZVIZ.
//
// ЗОВЁТ СТОРОЖ ОФИСА, а не браузер: у витрины своего планировщика нет, а
// у ботов он есть и уже ходит сюда за сводками. Заводить ради одной
// задачи второй механизм расписаний незачем — тот же довод, что у
// вечернего подведения итогов дня.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ `POST /api/farm/frame`. Туда кадр КЛАДУТ снаружи
// (компьютер рядом с камерой), сюда — ПРОСЯТ снять. Обе двери кончаются
// одним и тем же хранилищем, поэтому способы можно менять местами и
// держать один как запасной, не трогая ни блок на главной, ни приёмник.
//
// НЕ НАСТРОЕНО — НЕ ОШИБКА. Пока ключей EZVIZ нет, отвечаем спокойным
// «пропущено»: сторож не должен слать владельцу сигнал тревоги о том,
// чего он ещё не включал.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIDE = 1280;
const QUALITY = 72;

export async function POST(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cfg = readConfig();
    if (!cfg) {
      return NextResponse.json({ status: 'skipped', reason: 'EZVIZ не настроен' });
    }

    const raw = await captureFrame(cfg);
    // Сжимаем здесь же, а не при показе: облако отдаёт кадр в полном
    // разрешении камеры, а смотрят его в блоке шириной с телефон.
    const jpeg = await sharp(raw)
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toBuffer();

    await saveFrame(jpeg);
    return NextResponse.json({ status: 'ok', bytes: jpeg.length });
  } catch (error: unknown) {
    // Камера выключена на ночь — обычное дело, а не поломка сервиса.
    // Поэтому 200 с причиной словами, а не 500: сторож офиса не поднимет
    // тревогу, но причина видна и в ответе, и в журнале.
    const reason = safeError(error);
    console.warn('[farm/pull] кадр не снят:', reason);
    return NextResponse.json({ status: 'failed', reason });
  }
}
