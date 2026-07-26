'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminClient';

/* ─────────────────────────────────────────────
   Модерация кадров гостей.
   Одобренные попадают на витрину ресторана и в блок «Гости недели»
   следующего выпуска — поэтому каждый кадр смотрит человек.
   ───────────────────────────────────────────── */

interface Photo {
  id: string;
  imageUrl: string;
  guestName: string | null;
  guestHandle: string | null;
  status: string;
  createdAt: string;
  dish?: { nameRu: string } | null;
  restaurant?: { name: string } | null;
}

const FILTERS = [
  { id: 'pending', label: 'На модерации' },
  { id: 'approved', label: 'Одобренные' },
  { id: 'printed', label: 'Напечатанные' },
  { id: 'rejected', label: 'Отклонённые' },
];

export function GuestPhotosTab() {
  const [status, setStatus] = useState('pending');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const list = await (await adminFetch(`/api/admin/magazine/guest-photos?status=${status}`)).json();
    setPhotos(Array.isArray(list) ? list : []);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const setPhotoStatus = async (id: string, next: string) => {
    await adminFetch('/api/admin/magazine/guest-photos', {
      method: 'PATCH',
      body: JSON.stringify({ id, status: next }),
    });
    await load();
  };

  // Выгрузка кадров файлами: журнал верстается во внешнем редакторе.
  // <a href> не пошлёт заголовок с паролем, поэтому тянем через adminFetch.
  const exportZip = async () => {
    setCopied('Готовлю архив...');
    const res = await adminFetch(`/api/admin/magazine/guest-photos/export?status=${status}`);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setCopied(err?.error ?? `Ошибка выгрузки: ${res.status}`);
      return;
    }
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = `guests-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(href);
    setCopied(`Скачано кадров: ${photos.length}`);
    setTimeout(() => setCopied(''), 3000);
  };

  // После вёрстки номера — чтобы те же кадры не ушли в следующий выпуск
  const markAllPrinted = async () => {
    for (const p of photos) {
      await adminFetch('/api/admin/magazine/guest-photos', {
        method: 'PATCH',
        body: JSON.stringify({ id: p.id, status: 'printed' }),
      });
    }
    await load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatus(f.id)}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              background: status === f.id ? 'var(--brand-primary)' : 'transparent',
              color: status === f.id ? '#fff' : 'var(--text-primary)',
              fontWeight: 600, cursor: 'pointer',
            }}
          >{f.label}</button>
        ))}
        {photos.length > 0 && (
          <button onClick={exportZip} style={{
            padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
            border: 'none', background: 'var(--brand-primary)',
            color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}>
            ⬇ Скачать кадры ({photos.length}) для вёрстки
          </button>
        )}
        {status === 'approved' && photos.length > 0 && (
          <button onClick={markAllPrinted} style={{
            padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)', background: 'transparent',
            color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer',
          }}>
            Отметить все «напечатан»
          </button>
        )}
        {copied && <span style={{ color: 'var(--text-secondary)' }}>{copied}</span>}
      </div>

      {photos.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Кадров нет.</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 'var(--space-3)',
        }}>
          {photos.map((p) => (
            <div key={p.id} style={{
              borderRadius: 'var(--radius-lg)', overflow: 'hidden',
              border: '1px solid var(--border-color)', background: 'var(--bg-elevated)',
            }}>
              <img
                src={p.imageUrl}
                alt={p.guestName ?? ''}
                style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ padding: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <div style={{ fontWeight: 600 }}>{p.guestName || 'Без имени'}</div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {p.restaurant?.name}{p.dish ? ` · ${p.dish.nameRu}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {p.status !== 'approved' && (
                    <button onClick={() => setPhotoStatus(p.id, 'approved')} style={mini('var(--cat-10)')}>Одобрить</button>
                  )}
                  {p.status === 'approved' && (
                    <button onClick={() => setPhotoStatus(p.id, 'printed')} style={mini('var(--info)')}>Напечатан</button>
                  )}
                  {p.status !== 'rejected' && (
                    <button onClick={() => setPhotoStatus(p.id, 'rejected')} style={mini('var(--error)')}>Отклонить</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function mini(color: string): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 'var(--radius-md)',
    border: `1px solid ${color}`, background: 'transparent', color,
    fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  };
}
