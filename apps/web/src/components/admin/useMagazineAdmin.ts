'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { useFeedback } from './AdminFeedback';
import { useMagazineVideo } from './useMagazineVideo';
import type { MagazineRestaurant, MagazineDish } from './magazineTypes';

// ══════════════════════════════════════════════════════════════════════
// Состояние и операции админки журнала: выпуск, блюда, видео, QR.
// Вынесено из AdminMagazine — файл перерос 200 строк.
//
// Вынесено вместе с состоянием, а не отдельными функциями: обработчики
// трогают полтора десятка setState, и разрывать их с их же состоянием
// значило бы переписывать логику, а не переносить.
// ══════════════════════════════════════════════════════════════════════

export function useMagazineAdmin() {
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState('');
  const [quickName, setQuickName] = useState('');
  const [lastQr, setLastQr] = useState<{ code: number; slug: string } | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Загрузить или создать ресторан-по-умолчанию
  const { data: restaurant = null, isLoading: isLoadingRestaurant } = useQuery<MagazineRestaurant | null>({
    queryKey: ['magazine', 'restaurant'],
    queryFn: async () => {
      const list = await adminJsonArray<MagazineRestaurant>('/api/admin/magazine/restaurants');
      if (Array.isArray(list) && list.length > 0 && list[0]?.id) return list[0];
      // Автосоздание
      const res = await adminFetch('/api/admin/magazine/restaurants', {
        method: 'POST',
        body: JSON.stringify({ name: 'Fresh Weekly', slug: 'fresh', isMagazinePartner: true }),
      });
      const created = await res.json().catch(() => null);
      return created?.id ? created : null;
    }
  });

  const refreshRestaurant = async () => {
    await queryClient.invalidateQueries({ queryKey: ['magazine', 'restaurant'] });
  };

  const { data: dishes = [], isLoading: isLoadingDishes } = useQuery<MagazineDish[]>({
    queryKey: ['magazine', 'dishes', restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const res = await adminFetch(`/api/admin/magazine/dishes?restaurantId=${restaurant.id}`);
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!restaurant?.id,
  });

  const loading = isLoadingRestaurant || isLoadingDishes;

  const loadDishes = async (rid?: string) => {
    const id = rid || restaurant?.id;
    if (id) {
      await queryClient.invalidateQueries({ queryKey: ['magazine', 'dishes', id] });
    }
  };

  const ensureRestaurant = async () => {
    return queryClient.fetchQuery({
      queryKey: ['magazine', 'restaurant'],
      queryFn: async () => {
        const list = await adminJsonArray<MagazineRestaurant>('/api/admin/magazine/restaurants');
        if (Array.isArray(list) && list.length > 0 && list[0]?.id) return list[0];
        const res = await adminFetch('/api/admin/magazine/restaurants', {
          method: 'POST',
          body: JSON.stringify({ name: 'Fresh Weekly', slug: 'fresh', isMagazinePartner: true }),
        });
        const created = await res.json().catch(() => null);
        return created?.id ? created : null;
      }
    });
  };

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
      if (!data?.url) { notify.error(data?.error || 'Файл не загрузился'); return; }
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
    const agreed = await notify.confirm({
      title: `Удалить «${name}»?`,
      // Напечатанный QR уже у клиентов на столах — последствие снаружи.
      detail: 'QR-код перестанет работать.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!agreed) return;
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
