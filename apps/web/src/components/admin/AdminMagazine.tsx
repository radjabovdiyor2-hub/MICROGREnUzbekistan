'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { captureLastFrame } from '@/lib/magazine/videoPoster';
import { clientErrorMessage } from '@/lib/safeError';

/** Ресторан-владелец журнала — из /api/admin/magazine/restaurants. */
interface MagazineRestaurant {
  id: string;
  slug: string;
  magazinePdfUrl?: string | null;
  magazineHtmlUrl?: string | null;
}

/** Блюдо с видео-кадром — из /api/admin/magazine/dishes. */
interface MagazineDish {
  id: string;
  code: number;
  nameRu: string;
  videoUrl?: string | null;
  restaurantId?: string;
}

export function AdminMagazine() {
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

  useEffect(() => { ensureRestaurant().then((r) => { if (r) loadDishes(r.id); }); }, []);

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
      if (dish.restaurantId) await loadDishes(dish.restaurantId);
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
      await loadDishes(restaurant.id);
    } catch (err: unknown) {
      alert(`Ошибка: ${clientErrorMessage(err, 'Не удалось прикрепить видео')}`);
    } finally { setUploading(''); }
  };

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

  if (loading) return <div style={{ padding: 'var(--space-6)' }}>Загрузка...</div>;

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 840 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-6)' }}>Журнал · FRESH WEEKLY</h2>

      {/* Журнал: PDF / HTML */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        <FileCard
          label="📄 PDF журнала"
          url={restaurant?.magazinePdfUrl ?? null}
          accept=".pdf"
          uploading={uploading === 'magazinePdfUrl'}
          disabled={!!uploading}
          onUpload={(f) => uploadMagazine('magazinePdfUrl', f)}
          onRemove={() => removeMagazine('magazinePdfUrl')}
        />
        <FileCard
          label="🌐 HTML журнала"
          url={restaurant?.magazineHtmlUrl ?? null}
          accept=".html,.htm"
          uploading={uploading === 'magazineHtmlUrl'}
          disabled={!!uploading}
          onUpload={(f) => uploadMagazine('magazineHtmlUrl', f)}
          onRemove={() => removeMagazine('magazineHtmlUrl')}
        />
      </div>

      {/* Быстрое добавление видео → QR с поддержкой Drag-and-Drop */}
      <div
        className="card"
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f && (f.type.startsWith('video/') || f.name.match(/\.(mp4|webm|mov)$/i))) {
            quickAddVideo(f);
          }
        }}
        style={{
          padding: 'var(--space-4)', marginBottom: 'var(--space-4)',
          border: dragActive ? '2px dashed var(--brand-primary)' : '1px solid var(--border-color)',
          background: dragActive ? 'var(--brand-primary-light)' : undefined,
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontWeight: 'var(--font-bold)' }}>🎬 Загрузить видео → получить QR</h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Перетащите .mp4 сюда</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" placeholder="Название блюда (необязательно)" value={quickName} onChange={(e) => setQuickName(e.target.value)}
            style={{ flex: 1, minWidth: 180 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: '10px', background: 'var(--brand-primary)', color: 'var(--text-inverse)', fontWeight: 700, fontSize: 'var(--text-base)', cursor: uploading === 'quick' ? 'wait' : 'pointer' }}>
            {uploading === 'quick' ? '⏳ Загрузка...' : '📹 Загрузить видео'}
            <input type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} disabled={!!uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) quickAddVideo(f); e.target.value = ''; }} />
          </label>
        </div>

        {lastQr && (
          <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--success)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success)', fontWeight: 700 }}>✅ Готово · #{lastQr.code}</div>
            <a href={`/m/${lastQr.slug}/d/${lastQr.code}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>Открыть страницу ↗</a>
            <button onClick={() => copyLink(lastQr.slug, lastQr.code, 'last')} style={qrBtn}>
              {copiedId === 'last' ? '✅ Скопировано!' : '📋 Копировать ссылку'}
            </button>
            <button onClick={() => downloadQr(lastQr.code, 'png')} style={qrBtn}>⬇ QR PNG</button>
            <button onClick={() => downloadQr(lastQr.code, 'svg')} style={qrBtn}>⬇ QR SVG</button>
          </div>
        )}
      </div>

      {/* Список загруженных видео */}
      {dishes.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>Загруженные видео · {dishes.filter((d) => d.videoUrl).length} из {dishes.length}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {dishes.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2)', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ width: 36, fontWeight: 700, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>#{d.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === d.id ? (
                    <input
                      className="input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      style={{ fontWeight: 600, fontSize: 'var(--text-sm)', padding: '2px 6px', width: '100%' }}
                    />
                  ) : (
                    <div
                      style={{ fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer' }}
                      onClick={() => startRename(d)}
                      title="Нажмите чтобы переименовать"
                    >
                      {d.nameRu} <span style={{ fontSize: '10px', opacity: 0.4 }}>✎</span>
                    </div>
                  )}
                  {d.videoUrl
                    ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>▶ Видео загружено</span>
                        <button onClick={() => setPreviewVideoUrl(d.videoUrl ?? null)} style={{ border: 'none', background: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}>👁 Просмотр</button>
                      </div>
                    : <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Без видео</div>}
                </div>
                {d.videoUrl && (
                  <button onClick={() => restaurant && copyLink(restaurant.slug, d.code, d.id)} style={qrBtn}>
                    {copiedId === d.id ? '✅' : '📋 Ссылка'}
                  </button>
                )}
                <label style={{
                  padding: '4px 12px', borderRadius: '6px', fontSize: 'var(--text-sm)', fontWeight: 600,
                  border: '1px solid var(--border-color)', cursor: uploading ? 'wait' : 'pointer',
                  ...(d.videoUrl ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' } : {}),
                }}>
                  {d.videoUrl ? '▶ Заменить' : '+ Видео'}
                  <input type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} disabled={!!uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideoToDish(d.id, f); e.target.value = ''; }} />
                </label>
                <button onClick={() => downloadQr(d.code, 'png')} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>QR</button>
                {d.videoUrl && (
                  <button onClick={() => removeVideo(d.id)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>Убрать</button>
                )}
                <button onClick={() => removeDish(d.id, d.nameRu)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 'var(--text-xs)' }} title="Удалить запись целиком">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно предпросмотра видео */}
      {previewVideoUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setPreviewVideoUrl(null)}>
          <div style={{ position: 'relative', maxWidth: 400, width: '100%', background: '#000', borderRadius: 16, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <video src={previewVideoUrl} controls autoPlay playsInline style={{ width: '100%', maxHeight: '75vh', display: 'block' }} />
            <button onClick={() => setPreviewVideoUrl(null)} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: 'var(--text-inverse)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

const qrBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
};

function FileCard({ label, url, accept, uploading, disabled, onUpload, onRemove }: {
  label: string; url: string | null; accept: string; uploading: boolean; disabled: boolean;
  onUpload: (f: File) => void; onRemove: () => void;
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 200, padding: 'var(--space-3)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>{label}</div>
      {url ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>Открыть ↗</a>
          <label style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', cursor: disabled ? 'wait' : 'pointer' }}>
            Заменить
            <input type="file" accept={accept} style={{ display: 'none' }} disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
          </label>
          <button onClick={onRemove} style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--error)', cursor: 'pointer' }}>Удалить</button>
        </div>
      ) : (
        <label style={{ display: 'inline-block', fontSize: 'var(--text-sm)', padding: '6px 14px', borderRadius: '8px', background: 'var(--brand-primary)', color: 'var(--text-inverse)', cursor: disabled ? 'wait' : 'pointer', fontWeight: 600 }}>
          {uploading ? 'Загрузка...' : '⬆ Загрузить'}
          <input type="file" accept={accept} style={{ display: 'none' }} disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}
