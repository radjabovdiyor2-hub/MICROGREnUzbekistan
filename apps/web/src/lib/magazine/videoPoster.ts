// ════════════════════════════════════════════════════════════
// Постер ролика блюда — последний кадр, снятый в браузере.
//
// Почему в браузере: на сервере нет ни ffmpeg, ни sharp, и заводить их
// ради шести роликов не стоит. Админка и так работает в браузере, где
// <video> + <canvas> снимают кадр без единой зависимости.
//
// Почему последний кадр, а не первый: ролик по замыслу заканчивается
// статичным планом готового блюда. Постер видит гость до нажатия и на
// нём же видео замирает — первый кадр обычно пустая тарелка или руки.
// ════════════════════════════════════════════════════════════

/** Хвост, который отступаем от конца: seek ровно в duration часто не срабатывает. */
const TAIL_SECONDS = 0.05;
const TIMEOUT_MS = 15_000;

export interface PosterResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
}

export function captureLastFrame(file: File): Promise<PosterResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      fn();
    };

    const fail = (msg: string) => finish(() => reject(new Error(msg)));

    const timer = setTimeout(() => fail('Не удалось прочитать видео: истекло время ожидания'), TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => fail('Файл не читается как видео');

    video.onloadeddata = () => {
      const { duration, videoWidth, videoHeight } = video;
      if (!videoWidth || !videoHeight) return fail('В файле нет видеодорожки');
      // duration бывает Infinity у потоковых webm — тогда берём текущий кадр
      video.currentTime = Number.isFinite(duration) ? Math.max(0, duration - TAIL_SECONDS) : 0;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return fail('Canvas недоступен');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const meta = { width: canvas.width, height: canvas.height, duration: video.duration };
      canvas.toBlob(
        (blob) => (blob ? finish(() => resolve({ blob, ...meta })) : fail('Не удалось снять кадр')),
        'image/jpeg',
        0.85,
      );
    };

    video.src = url;
  });
}
