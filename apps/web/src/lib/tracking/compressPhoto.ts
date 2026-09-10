// ══════════════════════════════════════════════════════════════════════
// Сжатие кадра ДО отправки.
//
// ЗАЧЕМ. Сервер и так ужимает фото до 1600 px, но делает это ПОСЛЕ
// загрузки: телефон успевает отдать все 3–5 мегабайт. В поле связь — две
// палки LTE в подвале ресторана, и такая отправка занимает минуты, рвётся
// на середине и уходит в очередь, чтобы начаться заново. Двести килобайт
// вместо пяти мегабайт — это разница между «ушло» и «не ушло».
//
// Заодно легчает и очередь: кадр ждёт связи в IndexedDB, и хранить там
// пятимегабайтные оригиналы — это упереться в квоту на третьем фото.
//
// НИКОГДА НЕ ТЕРЯЕМ КАДР. Не получилось сжать — отдаём оригинал: пусть
// уйдёт медленно, чем не уйдёт вовсе. Человек снимал его один раз, стоя у
// дверей, и переснять уже не сможет.
//
// СЕРВЕР ВСЁ РАВНО ЖМЁТ. Здесь не защита от большого файла, а экономия
// канала: телу запроса верить нельзя, и лимит на сервере остаётся.
// ══════════════════════════════════════════════════════════════════════

/** Длинная сторона после сжатия — та же, что на сервере. */
export const MAX_SIDE = 1600;

/** Качество JPEG. Ниже сервера намеренно: канал дороже пикселей. */
export const QUALITY = 0.72;

/** Меньше этого сжимать нечего — накладные расходы съедят выигрыш. */
export const SKIP_BELOW_BYTES = 300 * 1024;

/**
 * Во сколько раз должно полегчать, чтобы результат имел смысл.
 *
 * HEIC и уже сжатые кадры иногда «сжимаются» в больший файл: браузер
 * разворачивает их в JPEG без потерь исходного размера. Отдать такой
 * результат значит сделать хуже ровно там, где хотели помочь.
 */
export const MIN_GAIN = 1.2;

/** Размеры после вписывания в квадрат `MAX_SIDE`. Пропорции сохраняются. */
export function fitSize(
  width: number,
  height: number,
  maxSide = MAX_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { width, height };
  const k = maxSide / longest;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** Стоит ли вообще браться: маленькие файлы и не-картинки пропускаем. */
export function worthCompressing(file: { size: number; type: string }): boolean {
  if (file.size <= SKIP_BELOW_BYTES) return false;
  // Телефоны шлют HEIC как `image/heic` и как пустой тип — берём и такие:
  // именно они и весят больше всего.
  return file.type === '' || file.type.startsWith('image/');
}

/** Оставить ли сжатый вариант, или он не лучше оригинала. */
export function isGain(originalBytes: number, compressedBytes: number): boolean {
  if (compressedBytes <= 0) return false;
  return originalBytes / compressedBytes >= MIN_GAIN;
}

/**
 * Сжать кадр. Всегда возвращает файл: при любой неудаче — исходный.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!worthCompressing(file)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitSize(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY);
    });
    if (!blob || !isGain(file.size, blob.size)) return file;

    return new File([blob], 'visit.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    // Битый файл, экзотический формат, нет памяти на большой холст — всё
    // это не повод потерять отчёт.
    return file;
  }
}
