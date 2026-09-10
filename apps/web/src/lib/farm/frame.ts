import { readFile, stat, writeFile } from 'fs/promises';
import path from 'path';

import { getUploadsDir } from '@/lib/uploads';

// ══════════════════════════════════════════════════════════════════════
// Живой кадр с фермы: хранение и — главное — срок годности.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ МОДУЛЕМ. Здесь одно решение, и оно про честность: с
// какого момента кадр перестаёт быть «сейчас». Прошлый блок фермы
// подписывал случайные посты ленты словами «теплица, срезка и упаковка» и
// врал на бою. Кадр недельной давности под подписью «прямо сейчас» —
// та же ошибка, только убедительнее: картинка настоящая, утверждение нет.
//
// ХРАНИМ ОДИН ФАЙЛ, а не историю. Задача — показать, что происходит
// сейчас; архив теплицы никому не нужен и съел бы диск за месяц. Время
// берём из самого файла, отдельной записи о нём не заводим: две записи об
// одном разъедутся, а `mtime` соврать нельзя.
// ══════════════════════════════════════════════════════════════════════

const FILE = 'farm-frame.jpg';

/**
 * Дольше этого кадр не считается живым.
 *
 * Пять минут — с запасом к любой разумной частоте съёмки: даже раз в
 * минуту оставляет четыре пропуска подряд, прежде чем блок погаснет.
 * Больше ставить нельзя: «ферма прямо сейчас» с получасовым кадром — это
 * уже не задержка, а другое утверждение.
 */
export const FRESH_MS = 5 * 60 * 1000;

export interface FarmFrame {
  bytes: Buffer;
  /** Когда кадр снят, по времени записи файла. */
  at: number;
}

async function framePath(): Promise<string> {
  return path.join(await getUploadsDir(), FILE);
}

/** Записать свежий кадр, заменив прежний. */
export async function saveFrame(bytes: Buffer): Promise<void> {
  await writeFile(await framePath(), bytes);
}

/**
 * Прочитать кадр, если он ещё живой.
 *
 * `null` означает три разных случая — кадра не было, камера молчит,
 * хранилище недоступно, — и все три для страницы означают одно: показывать
 * нечего. Различать их посетителю незачем.
 */
export async function readFreshFrame(now: number = Date.now()): Promise<FarmFrame | null> {
  try {
    const file = await framePath();
    const info = await stat(file);
    const at = info.mtimeMs;
    if (now - at > FRESH_MS) return null;
    return { bytes: await readFile(file), at };
  } catch {
    return null;
  }
}

/** Свежий ли кадр по времени. Вынесено ради тестов. */
export function isFresh(at: number, now: number = Date.now()): boolean {
  return now - at <= FRESH_MS && at <= now + 60_000;
}
