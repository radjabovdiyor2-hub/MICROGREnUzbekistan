'use client';

import { adminFetch } from '@/lib/adminClient';
import { captureLastFrame } from '@/lib/magazine/videoPoster';
import { clientErrorMessage } from '@/lib/safeError';
import type { MagazineRestaurant } from './AdminMagazine';

// ══════════════════════════════════════════════════════════════════════
// Видео блюда: быстрое добавление и замена ролика у существующего.
// Вынесено из useMagazineAdmin — тот перерос 200 строк.
//
// Обе операции снимают последний кадр ролика на постер: без него карточка
// блюда до первого воспроизведения остаётся чёрным прямоугольником.
// ══════════════════════════════════════════════════════════════════════

export function useMagazineVideo(
  restaurant: MagazineRestaurant | null,
  setUploading: (v: string) => void,
  setQuickName: (v: string) => void,
  setLastQr: (v: { code: number; slug: string } | null) => void,
  reload: (rid: string) => void,
  ensureRestaurant: () => Promise<MagazineRestaurant | null>,
  quickName: string,
) {
  const quickAddVideo = async (file: File) => {
    let targetResto = restaurant;
    if (!targetResto?.id) {
      targetResto = await ensureRestaurant();
    }

    const name = quickName.trim() || file.name.replace(/\.[^.]+$/, '');
    setUploading('quick');
    setLastQr(null);
    try {
      const send = async (f: File | Blob, n: string) => {
        const form = new FormData();
        form.append('file', f instanceof File ? f : new File([f], n, { type: f.type }));
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          const err = data?.error || (res.status === 413 ? 'Файл слишком большой (максимум 100МБ)' : `Ошибка сервера (${res.status})`);
          alert(err);
          return { url: null };
        }
        return data;
      };

      // 1. Загружаем видео сразу
      const videoRes = await send(file, file.name);
      if (!videoRes.url) return;

      // 2. Снимаем постер с таймаутом 2сек (не блокируя)
      let posterBlob: Blob | null = null;
      try {
        const posterPromise = captureLastFrame(file).then((r) => r.blob);
        const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 2000));
        posterBlob = await Promise.race([posterPromise, timeoutPromise]);
      } catch (err) {
        // Постер — необязательная обложка: видео загрузится и без него.
        console.warn('Не удалось снять кадр для постера:', err);
      }

      const dishData: Record<string, string> = { nameRu: name, videoUrl: videoRes.url };
      if (targetResto?.id) dishData.restaurantId = targetResto.id;

      if (posterBlob) {
        const posterRes = await send(posterBlob, `poster-${Date.now()}.jpg`);
        if (posterRes.url) dishData.videoPoster = posterRes.url;
      }

      // 3. Создаем блюдо
      const res = await adminFetch('/api/admin/magazine/dishes', {
        method: 'POST',
        body: JSON.stringify(dishData),
      });
      const dish = await res.json().catch(() => null);
      if (!dish || dish.error) {
        alert(`Ошибка создания блюда: ${dish?.error || res.statusText || 'Сервер не вернул данные'}`);
        return;
      }
      const slug = dish.restaurant?.slug || targetResto?.slug || 'fresh';
      if (dish.code) setLastQr({ code: dish.code, slug });
      setQuickName('');
      if (dish.restaurantId) await reload(dish.restaurantId);
    } catch (err: unknown) {
      alert(`Ошибка: ${clientErrorMessage(err, 'Не удалось загрузить видео')}`);
    } finally { setUploading(''); }
  };

  const uploadVideoToDish = async (dishId: string, file: File) => {
    if (!restaurant) return;
    setUploading(`video-${dishId}`);
    try {
      const send = async (f: File | Blob, n: string) => {
        const form = new FormData();
        form.append('file', f instanceof File ? f : new File([f], n, { type: f.type }));
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.url) {
          const err = data?.error || (res.status === 413 ? 'Файл слишком большой (максимум 100МБ)' : `Ошибка сервера (${res.status})`);
          alert(err);
          return { url: null };
        }
        return data;
      };

      const videoRes = await send(file, file.name);
      if (!videoRes.url) return;

      let posterBlob: Blob | null = null;
      try {
        const posterPromise = captureLastFrame(file).then((r) => r.blob);
        const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 2000));
        posterBlob = await Promise.race([posterPromise, timeoutPromise]);
      } catch (err) {
        // Постер — необязательная обложка: видео загрузится и без него.
        console.warn('Не удалось снять кадр для постера:', err);
      }

      const patch: Record<string, string> = { videoUrl: videoRes.url };
      if (posterBlob) {
        const posterRes = await send(posterBlob, `poster-${Date.now()}.jpg`);
        if (posterRes.url) patch.videoPoster = posterRes.url;
      }

      await adminFetch('/api/admin/magazine/dishes', {
        method: 'PATCH',
        body: JSON.stringify({ id: dishId, ...patch }),
      });
      await reload(restaurant.id);
    } catch (err: unknown) {
      alert(`Ошибка: ${clientErrorMessage(err, 'Не удалось прикрепить видео')}`);
    } finally { setUploading(''); }
  };


  return { quickAddVideo, uploadVideoToDish };
}
