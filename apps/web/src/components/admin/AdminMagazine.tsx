'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { MenuTab } from '@/components/admin/magazine/MenuTab';
import { captureLastFrame } from '@/lib/magazine/videoPoster';

type Tab = 'journals' | 'menu';

export function AdminMagazine() {
  const [tab, setTab] = useState<Tab>('journals');

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-6)' }}>Управление Журналом · FRESH WEEKLY</h2>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)' }}>
        <button onClick={() => setTab('journals')} style={{
          padding: 'var(--space-2) var(--space-4)',
          background: tab === 'journals' ? 'var(--brand-primary)' : 'transparent',
          color: tab === 'journals' ? '#fff' : 'var(--text-primary)',
          borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-semibold)', border: 'none', cursor: 'pointer',
        }}>📋 Журналы</button>
        <button onClick={() => setTab('menu')} style={{
          padding: 'var(--space-2) var(--space-4)',
          background: tab === 'menu' ? 'var(--brand-primary)' : 'transparent',
          color: tab === 'menu' ? '#fff' : 'var(--text-primary)',
          borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-semibold)', border: 'none', cursor: 'pointer',
        }}>🍽 Меню и видео</button>
      </div>

      {tab === 'journals' && <JournalsTab />}
      {tab === 'menu' && <MenuTab />}
    </div>
  );
}

// ════════════════════ ЖУРНАЛЫ ════════════════════
function JournalsTab() {
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [dishes, setDishes] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [uploading, setUploading] = useState('');
  const [loading, setLoading] = useState(true);
  const [quickName, setQuickName] = useState('');
  const [lastQr, setLastQr] = useState<{ code: number; slug: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminJsonArray('/api/admin/magazine/restaurants');
      setRestaurants(list);
      if (selected) {
        const fresh = list.find((r: any) => r.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { load(); }, []);

  const loadDishes = useCallback(async (restaurantId: string) => {
    if (!restaurantId) return setDishes([]);
    const res = await adminFetch(`/api/admin/magazine/dishes?restaurantId=${restaurantId}`);
    const data = await res.json().catch(() => []);
    setDishes(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { if (selected) loadDishes(selected.id); }, [selected, loadDishes]);

  const addRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await adminFetch('/api/admin/magazine/restaurants', {
      method: 'POST',
      body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() || undefined, isMagazinePartner: true }),
    });
    setNewName(''); setNewSlug('');
    await load();
  };

  const uploadFile = async (field: 'magazinePdfUrl' | 'magazineHtmlUrl', file: File) => {
    if (!selected) return;
    setUploading(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.url) { alert(data.error || 'Ошибка загрузки'); return; }
      await adminFetch('/api/admin/magazine/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({ id: selected.id, [field]: data.url }),
      });
      await load();
    } finally { setUploading(''); }
  };

  const removeFile = async (field: 'magazinePdfUrl' | 'magazineHtmlUrl') => {
    if (!selected) return;
    await adminFetch('/api/admin/magazine/restaurants', {
      method: 'PATCH',
      body: JSON.stringify({ id: selected.id, [field]: null }),
    });
    await load();
  };

  const uploadVideo = async (dishId: string, file: File) => {
    if (!selected) return;
    setUploading(`video-${dishId}`);
    try {
      let poster: Blob | null = null;
      try { poster = (await captureLastFrame(file)).blob; } catch { /* без постера */ }

      const send = async (f: File | Blob, name: string) => {
        const form = new FormData();
        form.append('file', f instanceof File ? f : new File([f], name, { type: f.type }));
        return (await fetch('/api/upload', { method: 'POST', body: form })).json();
      };

      const videoRes = await send(file, file.name);
      if (!videoRes.url) return;

      const patch: Record<string, string> = { videoUrl: videoRes.url };
      if (poster) {
        const posterRes = await send(poster, `poster-${Date.now()}.jpg`);
        if (posterRes.url) patch.videoPoster = posterRes.url;
      }

      await adminFetch('/api/admin/magazine/dishes', {
        method: 'PATCH',
        body: JSON.stringify({ id: dishId, ...patch }),
      });
      await loadDishes(selected.id);
    } finally { setUploading(''); }
  };

  const removeVideo = async (dishId: string) => {
    if (!selected) return;
    await adminFetch('/api/admin/magazine/dishes', {
      method: 'PATCH',
      body: JSON.stringify({ id: dishId, videoUrl: null, videoPoster: null }),
    });
    await loadDishes(selected.id);
  };

  // Быстрое добавление: загрузить видео → создать блюдо → показать QR
  const quickAddVideo = async (file: File) => {
    if (!selected) return;
    const name = quickName.trim() || file.name.replace(/\.[^.]+$/, '');
    setUploading('quick');
    setLastQr(null);
    try {
      let poster: Blob | null = null;
      try { poster = (await captureLastFrame(file)).blob; } catch { /* без постера */ }

      const send = async (f: File | Blob, n: string) => {
        const form = new FormData();
        form.append('file', f instanceof File ? f : new File([f], n, { type: f.type }));
        return (await fetch('/api/upload', { method: 'POST', body: form })).json();
      };

      const videoRes = await send(file, file.name);
      if (!videoRes.url) return;

      const dishData: any = { restaurantId: selected.id, nameRu: name, videoUrl: videoRes.url };
      if (poster) {
        const posterRes = await send(poster, `poster-${Date.now()}.jpg`);
        if (posterRes.url) dishData.videoPoster = posterRes.url;
      }

      const res = await adminFetch('/api/admin/magazine/dishes', {
        method: 'POST',
        body: JSON.stringify(dishData),
      });
      const dish = await res.json();
      if (dish.code) setLastQr({ code: dish.code, slug: selected.slug });
      setQuickName('');
      await loadDishes(selected.id);
    } finally { setUploading(''); }
  };

  const downloadQr = async (slug: string, code: number, format: 'png' | 'svg') => {
    const res = await adminFetch(`/api/admin/magazine/dishes/qr?restaurantId=${selected?.id}&code=${code}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${slug}-${code}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-4)', minHeight: 400 }}>
      {/* Список ресторанов */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>Рестораны</h3>

        <form onSubmit={addRestaurant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <input className="input" placeholder="Название ресторана" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input className="input" placeholder="slug (латиницей)" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
          <button type="submit" style={{ background: 'var(--brand-primary)', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Добавить</button>
        </form>

        {restaurants.map((r) => (
          <div key={r.id} onClick={() => setSelected(r)} style={{
            padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
            background: selected?.id === r.id ? 'var(--bg-secondary)' : 'transparent', marginBottom: 4,
          }}>
            <div style={{ fontWeight: 600 }}>
              {r.name}
              {(r.magazinePdfUrl || r.magazineHtmlUrl) && <span style={{ marginLeft: 6, fontSize: 12 }}>📎</span>}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>/m/{r.slug}</div>
          </div>
        ))}
        {restaurants.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Нет ресторанов</div>}
      </div>

      {/* Файлы + видео */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <h3 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>{selected.name}</h3>
              <a href={`/m/${selected.slug}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', textDecoration: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>👁 Живое меню →</a>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
              <FileUploadCard
                label="📄 PDF журнала"
                url={selected.magazinePdfUrl}
                accept=".pdf"
                uploading={uploading === 'magazinePdfUrl'}
                disabled={!!uploading}
                onUpload={(f) => uploadFile('magazinePdfUrl', f)}
                onRemove={() => removeFile('magazinePdfUrl')}
              />
              <FileUploadCard
                label="🌐 HTML журнала"
                url={selected.magazineHtmlUrl}
                accept=".html,.htm"
                uploading={uploading === 'magazineHtmlUrl'}
                disabled={!!uploading}
                onUpload={(f) => uploadFile('magazineHtmlUrl', f)}
                onRemove={() => removeFile('magazineHtmlUrl')}
              />
            </div>

            {/* Быстрое добавление видео → QR */}
            <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--border-color)', background: 'var(--bg-secondary)', marginBottom: 'var(--space-4)' }}>
              <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>🎬 Добавить видео → получить QR</h4>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="input" placeholder="Название блюда" value={quickName} onChange={(e) => setQuickName(e.target.value)}
                  style={{ flex: 1, minWidth: 180 }} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, cursor: uploading === 'quick' ? 'wait' : 'pointer' }}>
                  {uploading === 'quick' ? '⏳ Загрузка...' : '📹 Загрузить видео'}
                  <input type="file" accept="video/mp4,video/webm" style={{ display: 'none' }} disabled={!!uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) quickAddVideo(f); e.target.value = ''; }} />
                </label>
              </div>
              {lastQr && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', border: '1px solid var(--success)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success)', fontWeight: 600 }}>✅ Видео загружено · Блюдо #{lastQr.code}</div>
                  <a href={`/m/${lastQr.slug}/d/${lastQr.code}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>Открыть страницу ↗</a>
                  <button onClick={() => downloadQr(lastQr.slug, lastQr.code, 'png')} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600 }}>⬇ QR PNG</button>
                  <button onClick={() => downloadQr(lastQr.slug, lastQr.code, 'svg')} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600 }}>⬇ QR SVG</button>
                </div>
              )}
            </div>

            {/* Список блюд с видео */}
            {dishes.length > 0 && (
              <>
                <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>Блюда с видео</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {dishes.map((d: any) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2)', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ width: 32, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>#{d.code}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{d.nameRu}</div>
                        {d.videoUrl
                          ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>▶ Видео загружено</div>
                          : <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Без видео</div>}
                      </div>
                      <label style={{
                        padding: '4px 12px', borderRadius: '6px', fontSize: 'var(--text-sm)', fontWeight: 600,
                        border: '1px solid var(--border-color)', cursor: uploading ? 'wait' : 'pointer',
                        ...(d.videoUrl ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' } : {}),
                      }}>
                        {d.videoUrl ? '▶ Заменить' : '+ Видео'}
                        <input type="file" accept="video/mp4,video/webm" style={{ display: 'none' }} disabled={!!uploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(d.id, f); e.target.value = ''; }} />
                      </label>
                      <button onClick={() => downloadQr(selected.slug, d.code, 'png')} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>QR</button>
                      {d.videoUrl && (
                        <button onClick={() => removeVideo(d.id)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>Убрать</button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            Выбери ресторан слева или добавь новый
          </div>
        )}
      </div>
    </div>
  );
}

function FileUploadCard({ label, url, accept, uploading, disabled, onUpload, onRemove }: {
  label: string; url: string | null; accept: string; uploading: boolean; disabled: boolean;
  onUpload: (f: File) => void; onRemove: () => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 200, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>{label}</div>
      {url ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>Открыть ↗</a>
          <label style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', cursor: disabled ? 'wait' : 'pointer' }}>
            Заменить
            <input type="file" accept={accept} style={{ display: 'none' }} disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
          </label>
          <button onClick={onRemove} style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>Удалить</button>
        </div>
      ) : (
        <label style={{ display: 'inline-block', fontSize: 'var(--text-sm)', padding: '6px 14px', borderRadius: '8px', background: 'var(--brand-primary)', color: '#fff', cursor: disabled ? 'wait' : 'pointer' }}>
          {uploading ? 'Загрузка...' : '⬆ Загрузить'}
          <input type="file" accept={accept} style={{ display: 'none' }} disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}
