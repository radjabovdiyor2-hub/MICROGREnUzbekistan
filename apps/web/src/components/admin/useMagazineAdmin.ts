'use client';

import { useState, useCallback, useEffect } from 'react';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { useMagazineVideo } from './useMagazineVideo';
import type { MagazineRestaurant, MagazineDish } from './AdminMagazine';

// ══════════════════════════════════════════════════════════════════════
// Состояние и операции админки журнала: выпуск, блюда, видео, QR.
// Вынесено из AdminMagazine — файл перерос 200 строк.
//
// Вынесено вместе с состоянием, а не отдельными функциями: обработчики
// трогают полтора десятка setState, и разрывать их с их же состоянием
// значило бы переписывать логику, а не переносить.
// ══════════════════════════════════════════════════════════════════════

export function useMagazineAdmin() {
  const [restaurant, setRestaurant] = useState<MagazineRestaurant | null>(null);
  const [dishes, setDishes] = useState<MagazineDish[]>([]);
  const [uploading, setUploading] = useState('');
  const [loading, setLoading] = useState(true);
  const [quickName, setQuickName] = useState('');
  const [lastQr, setLastQr] = useState<{ code: number; slug: string } | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Загрузить или создать ресторан-по-умолчанию
  const ensureRestaurant = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminJsonArray<MagazineRestaurant>('/api/admin/magazine/restaurants');
      if (Array.isArray(list) && list.length > 0 && list[0]?.id) {
        setRestaurant(list[0]);
        return list[0];
      }
      // Автосоздание
      const res = await adminFetch('/api/admin/magazine/restaurants', {
        method: 'POST',
        body: JSON.stringify({ name: 'Fresh Weekly', slug: 'fresh', isMagazinePartner: true }),
      });
      const created = await res.json().catch(() => null);
      if (created?.id) {
        setRestaurant(created);
        return created;
      }
      return null;
    } finally { setLoading(false); }
  }, []);

  const refreshRestaurant = useCallback(async () => {
    const list = await adminJsonArray<MagazineRestaurant>('/api/admin/magazine/restaurants');
    if (Array.isArray(list) && list.length > 0 && list[0]?.id) setRestaurant(list[0]);
  }, []);

  const loadDishes = useCallback(async (rid: string) => {
    const res = await adminFetch(`/api/admin/magazine/dishes?restaurantId=${rid}`);
    const data = await res.json().catch(() => []);
    setDishes(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { ensureRestaurant().then((r) => { if (r) loadDishes(r.id); }); }, [ensureRestaurant, loadDishes]);

  // Скопировать ссылку в буфер обмена
  const copyLink = (slug: string, code: number, id: string) => {
    const url = `${window.location.origin}/m/${slug}/d/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Загрузить журнал (PDF/HTML)
  const uploadMagazine = async (field: 'magazinePdfUrl' | 'magazineHtmlUrl', file: File) => {
    if (!restaurant) return;
    setUploading(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!data?.url) { alert(data?.error || 'Ошибка загрузки файла'); return; }
      await adminFetch('/api/admin/magazine/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({ id: restaurant.id, [field]: data.url }),
      });
      await refreshRestaurant();
    } finally { setUploading(''); }
  };

  const removeMagazine = async (field: 'magazinePdfUrl' | 'magazineHtmlUrl') => {
    if (!restaurant) return;
    await adminFetch('/api/admin/magazine/restaurants', {
      method: 'PATCH',
      body: JSON.stringify({ id: restaurant.id, [field]: null }),
    });
    await refreshRestaurant();
  };

  // Загрузить видео → создать блюдо → показать QR
  const { quickAddVideo, uploadVideoToDish } =
    useMagazineVideo(restaurant, setUploading, setQuickName, setLastQr, loadDishes, ensureRestaurant, quickName);

  const removeVideo = async (dishId: string) => {
    if (!restaurant) return;
    await adminFetch('/api/admin/magazine/dishes', {
      method: 'PATCH',
      body: JSON.stringify({ id: dishId, videoUrl: null, videoPoster: null }),
    });
    await loadDishes(restaurant.id);
  };

  const removeDish = async (id: string, name: string) => {
    if (!restaurant) return;
    if (!window.confirm(`Удалить «${name}»? QR-код перестанет работать.`)) return;
    await adminFetch(`/api/admin/magazine/dishes?id=${id}`, { method: 'DELETE' });
    await loadDishes(restaurant.id);
  };

  const startRename = (d: MagazineDish) => {
    setEditingId(d.id);
    setEditingName(d.nameRu);
  };

  const saveRename = async () => {
    if (!editingId || !editingName.trim() || !restaurant) { setEditingId(null); return; }
    await adminFetch('/api/admin/magazine/dishes', {
      method: 'PATCH',
      body: JSON.stringify({ id: editingId, nameRu: editingName.trim() }),
    });
    setEditingId(null);
    await loadDishes(restaurant.id);
  };

  const downloadQr = async (code: number, format: 'png' | 'svg') => {
    if (!restaurant) return;
    const res = await adminFetch(`/api/admin/magazine/dishes/qr?restaurantId=${restaurant.id}&code=${code}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${restaurant.slug}-${code}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };


  return {
    restaurant, dishes, uploading, loading, quickName, setQuickName,
    lastQr, previewVideoUrl, setPreviewVideoUrl, copiedId, dragActive, setDragActive,
    editingId, editingName, setEditingName,
    refreshRestaurant, loadDishes, copyLink, uploadMagazine, removeMagazine,
    quickAddVideo, uploadVideoToDish, removeVideo, removeDish,
    startRename, saveRename, downloadQr, setEditingId,
  };
}
