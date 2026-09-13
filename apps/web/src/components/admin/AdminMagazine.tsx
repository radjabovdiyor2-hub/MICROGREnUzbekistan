'use client';

import { AdminMagazineDishes } from './AdminMagazineDishes';


import { type MagazineRestaurant, type MagazineDish, qrBtn } from './magazineTypes';
export type { MagazineRestaurant, MagazineDish };
export { qrBtn };

import { useMagazineAdmin } from './useMagazineAdmin';

const T = {
  loading: { ru: 'Загрузка...', uz: 'Yuklanmoqda...' },
  title: { ru: 'Живое меню заведения', uz: 'Muassasaning jonli menyusi' },
  hint: {
    ru: 'Блюда, ролики и печатные QR витрины /m/<slug>. Номер журнала и его PDF заводятся на вкладке «Номера».',
    uz: "Taomlar, roliklar va /m/<slug> vitrinasining chop etiladigan QR kodlari. Jurnal soni va uning PDF fayli «Sonlar» bo'limida kiritiladi.",
  },
  uploadTitle: { ru: '🎬 Загрузить видео → получить QR', uz: '🎬 Video yuklash → QR olish' },
  dropHere: { ru: 'Перетащите .mp4 сюда', uz: '.mp4 faylni shu yerga tashlang' },
  dishName: { ru: 'Название блюда (необязательно)', uz: 'Taom nomi (majburiy emas)' },
  uploading: { ru: '⏳ Загрузка...', uz: '⏳ Yuklanmoqda...' },
  upload: { ru: '📹 Загрузить видео', uz: '📹 Video yuklash' },
  ready: { ru: '✅ Готово', uz: '✅ Tayyor' },
  openPage: { ru: 'Открыть страницу ↗', uz: 'Sahifani ochish ↗' },
  copied: { ru: '✅ Скопировано!', uz: '✅ Nusxalandi!' },
  copyLink: { ru: '📋 Копировать ссылку', uz: '📋 Havolani nusxalash' },
};

export function AdminMagazine({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const {
    restaurant, dishes, uploading, loading, quickName, setQuickName,
    lastQr, previewVideoUrl, setPreviewVideoUrl, copiedId, dragActive, setDragActive,
    editingId, editingName, setEditingName,
    copyLink,
    quickAddVideo, uploadVideoToDish, removeVideo, removeDish,
    startRename, saveRename, downloadQr, setEditingId,
  } = useMagazineAdmin();

  if (loading) return <div style={{ padding: 'var(--space-6)' }}>{t('loading')}</div>;

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 840 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)' }}>{t('title')}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', maxWidth: 620 }}>
        {t('hint')}
      </p>

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ fontWeight: 'var(--font-bold)' }}>{t('uploadTitle')}</h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('dropHere')}</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" placeholder={t('dishName')} value={quickName} onChange={(e) => setQuickName(e.target.value)}
            style={{ flex: 1, minWidth: 180 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: '10px', background: 'var(--brand-primary)', color: 'var(--text-inverse)', fontWeight: 700, fontSize: 'var(--text-base)', cursor: uploading === 'quick' ? 'wait' : 'pointer' }}>
            {uploading === 'quick' ? t('uploading') : t('upload')}
            <input type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} disabled={!!uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) quickAddVideo(f); e.target.value = ''; }} />
          </label>
        </div>

        {lastQr && (
          <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--success)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--success)', fontWeight: 700 }}>{t('ready')} · #{lastQr.code}</div>
            <a href={`/m/${lastQr.slug}/d/${lastQr.code}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>{t('openPage')}</a>
            <button onClick={() => copyLink(lastQr.slug, lastQr.code, 'last')} style={qrBtn}>
              {copiedId === 'last' ? t('copied') : t('copyLink')}
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
