// ══════════════════════════════════════════════════════════════════════
// Загрузка изображений товара.
// Вынесено из AdminProducts: файл перерос 200 строк.
//
// Сжатие идёт в браузере до отправки: снимок с телефона весит десяток
// мегабайт, и без этого владелец с мобильного интернета просто не
// дожидается загрузки.
// ══════════════════════════════════════════════════════════════════════

// Compress image on client before upload — turns 10MB phone photo into ~200KB
export const compressImage = (file: File, maxSize = 1200, quality = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    // Skip if already small
    if (file.size < 300 * 1024) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Scale down to maxSize
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) {
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(compressed);
        } else {
          resolve(file);
        }
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/** Загружает снимок и возвращает результат: состоянием управляет вызывающий. */
export const uploadImage = async (file: File): Promise<UploadResult> => {
  try {
    const compressed = await compressImage(file);
    const sizeMB = (compressed.size / 1024 / 1024).toFixed(1);

    const formData = new FormData();
    formData.append('file', compressed);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok && res.status === 413) {
      return { ok: false, error: `Fayl juda katta: ${sizeMB}MB` };
    }
    const data = await res.json();
    if (data.success && data.url) return { ok: true, url: data.url };
    return { ok: false, error: data.error || 'Yuklashda xatolik' };
  } catch (err) {
    console.error('Upload error:', err);
    return { ok: false, error: 'Tarmoq xatosi: yuklanmadi' };
  }
};
