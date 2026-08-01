'use client';

import { AdminMagazineDishes } from './AdminMagazineDishes';


import { type MagazineRestaurant, type MagazineDish, qrBtn } from './magazineTypes';
export type { MagazineRestaurant, MagazineDish };
export { qrBtn };

import { useMagazineAdmin } from './useMagazineAdmin';

export function AdminMagazine() {
  const {
    restaurant, dishes, uploading, loading, quickName, setQuickName,
    lastQr, previewVideoUrl, setPreviewVideoUrl, copiedId, dragActive, setDragActive,
    editingId, editingName, setEditingName,
    copyLink, uploadMagazine, removeMagazine,
    quickAddVideo, uploadVideoToDish, removeVideo, removeDish,
    startRename, saveRename, downloadQr, setEditingId,
  } = useMagazineAdmin();

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

      <AdminMagazineDishes
        dishes={dishes}
        restaurant={restaurant}
        uploading={uploading}
        copiedId={copiedId}
        editingId={editingId}
        setEditingId={setEditingId}
        editingName={editingName}
        setEditingName={setEditingName}
        startRename={startRename}
        saveRename={saveRename}
        copyLink={copyLink}
        downloadQr={downloadQr}
        uploadVideoToDish={uploadVideoToDish}
        removeVideo={removeVideo}
        removeDish={removeDish}
        setPreviewVideoUrl={setPreviewVideoUrl}
      />
      {/* Модальное окно предпросмотра видео */}
      {previewVideoUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(var(--overlay-dark-rgb), 0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setPreviewVideoUrl(null)}>
          <div style={{ position: 'relative', maxWidth: 400, width: '100%', background: 'rgb(var(--overlay-dark-rgb))', borderRadius: 16, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <video src={previewVideoUrl} controls autoPlay playsInline style={{ width: '100%', maxHeight: '75vh', display: 'block' }} />
            <button onClick={() => setPreviewVideoUrl(null)} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(var(--overlay-dark-rgb), 0.6)', color: 'var(--text-inverse)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
