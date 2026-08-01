'use client';

import { qrBtn, type MagazineDish, type MagazineRestaurant } from './magazineTypes';

// Список блюд с загруженными видео: переименование, QR, замена и удаление.
// Вынесен из AdminMagazine — вторая половина экрана после блока загрузки.


interface Props {
  dishes: MagazineDish[];
  restaurant: MagazineRestaurant | null;
  uploading: string;
  copiedId: string | null;
  editingId: string | null;
  setEditingId: (v: string | null) => void;
  editingName: string;
  setEditingName: (v: string) => void;
  startRename: (d: MagazineDish) => void;
  saveRename: () => void;
  copyLink: (slug: string, code: number, id: string) => void;
  downloadQr: (code: number, fmt: 'png' | 'svg') => void;
  uploadVideoToDish: (id: string, file: File) => void;
  removeVideo: (id: string) => void;
  removeDish: (id: string, name: string) => void;
  setPreviewVideoUrl: (v: string | null) => void;
}

export function AdminMagazineDishes({ dishes, restaurant, uploading, copiedId, editingId, setEditingId, editingName, setEditingName, startRename, saveRename, copyLink, downloadQr, uploadVideoToDish, removeVideo, removeDish, setPreviewVideoUrl }: Props) {
  return (
    <>
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
    </>
  );
}
