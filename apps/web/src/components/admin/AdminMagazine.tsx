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

            <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>🎬 Видео для QR-кодов</h4>
            {dishes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Нет блюд. Перейди на вкладку «🍽 Меню и видео» чтобы загрузить меню.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {dishes.map((d: any) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2)', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ width: 32, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>#{d.code}</span>
                    {d.photo
                      ? <img src={d.photo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-elevated)' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{d.nameRu}</div>
                      {d.videoUrl && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>▶ Видео загружено</div>}
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
                    {d.videoUrl && (
                      <button onClick={() => removeVideo(d.id)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>Убрать</button>
                    )}
                  </div>
                ))}
              </div>
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
