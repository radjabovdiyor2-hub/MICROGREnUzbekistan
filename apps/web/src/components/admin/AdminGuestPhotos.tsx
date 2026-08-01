'use client';

import { btn, btnPrimary } from './adminGuestPhotosStyles';

// ══════════════════════════════════════════════════════════════════════
// Кадры гостей: отбор для следующего номера.
//
// Кадры приходят сами: гость в «Живом меню» нажимает «Снять кадр»,
// /api/menu/photo кладёт снимок со статусом pending. Дальше нужен глаз —
// в печать и на публичную витрину идут только одобренные.
//
// Этот экран закрывает единственное отсутствующее звено. Модель, приём
// кадров, модерация и выгрузка ZIP были готовы давно
// (api/admin/magazine/guest-photos + /export), а посмотреть кадры было
// негде: спека обещала «админка → 📸 Гости недели», но такого экрана
// в коде не существовало.
//
// Порядок работы: pending → одобрить → «Скачать для вёрстки» (ZIP с фото
// и captions.txt) → вставить в номер → отметить «Напечатано», чтобы кадр
// не попал во второй выпуск.
// ══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';


import { TABS, type Photo, type Status } from './adminGuestPhotosConfig';

export function AdminGuestPhotos() {
  const [status, setStatus] = useState<Status>('pending');
  const [all, setAll] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Тянем весь список одним запросом и делим по статусам на клиенте.
  // Отдельный запрос на каждую вкладку ради счётчиков давал пять обращений
  // и два эффекта вместо одного. API отдаёт до 120 последних кадров —
  // для очереди отбора этого хватает, счётчики упираются в тот же предел.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAll(await adminJsonArray('/api/admin/magazine/guest-photos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = TABS.reduce((acc, t) => {
    acc[t.id] = all.filter((p) => p.status === t.id).length;
    return acc;
  }, {} as Record<Status, number>);
  const photos = all.filter((p) => p.status === status);

  const setPhotoStatus = async (id: string, next: Status) => {
    setBusyId(id);
    setNote('');
    try {
      const res = await adminFetch('/api/admin/magazine/guest-photos', {
        method: 'PATCH',
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) { setNote('Не удалось изменить статус'); return; }
      // Правим локально: кадр сам уйдёт на другую вкладку, перезапрос не нужен
      setAll((prev) => prev.map((p) => (p.id === id ? { ...p, status: next } : p)));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Удалить кадр навсегда? Отменить будет нельзя.')) return;
    setBusyId(id);
    setNote('');
    try {
      const res = await adminFetch(`/api/admin/magazine/guest-photos?id=${id}`, { method: 'DELETE' });
      if (!res.ok) { setNote('Не удалось удалить'); return; }
      setAll((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  // Выгрузка одним ZIP: журнал верстается вне админки, туда нужны файлы.
  // captions.txt внутри держит подписи в том же порядке, что имена файлов.
  const downloadZip = async () => {
    setNote('');
    const res = await adminFetch(`/api/admin/magazine/guest-photos/export?status=approved`);
    if (!res.ok) {
      setNote(counts.approved ? 'Не удалось собрать архив' : 'Сначала отберите кадры на вкладке «На проверке»');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `guest-photos-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 1080 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)' }}>
        📸 Кадры гостей
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', maxWidth: 640 }}>
        Гости снимают блюда через QR в номере. Отберите нужные, выгрузите архив и вставьте
        в следующий выпуск. После печати отметьте кадры как напечатанные — тогда они не
        попадут в номер повторно.
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setStatus(t.id)}
            title={t.hint}
            style={{
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: 'var(--text-sm)',
              fontWeight: status === t.id ? 700 : 500,
              border: `1px solid ${status === t.id ? 'var(--brand-primary)' : 'var(--border-color)'}`,
              background: status === t.id ? 'var(--brand-primary)' : 'transparent',
              color: status === t.id ? 'rgb(var(--overlay-light-rgb))' : 'var(--text-primary)',
            }}
          >
            {t.label} <span style={{ opacity: 0.7 }}>{counts[t.id]}</span>
          </button>
        ))}
        <button onClick={downloadZip} style={{ ...btn, marginLeft: 'auto', fontWeight: 700 }}>
          ⬇ Скачать для вёрстки ({counts.approved})
        </button>
      </div>

      {note && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-secondary)', fontSize: 'var(--text-sm)' }}>
          {note}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>Загрузка…</div>
      ) : photos.length === 0 ? (
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {status === 'pending'
            ? 'Новых кадров нет. Они появятся, когда гость нажмёт «Снять кадр» на странице блюда.'
            : 'Пусто.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 'var(--space-4)' }}>
          {photos.map((p) => (
            <figure key={p.id} style={{ margin: 0, border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
              {/* Кадр приходит вертикальным 9:16 — показываем в той же пропорции,
                  чтобы было видно то, что увидит вёрстка */}
              <a href={p.imageUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={p.imageUrl}
                  alt={p.guestName || 'кадр гостя'}
                  style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', background: 'rgb(var(--overlay-dark-rgb))' }}
                />
              </a>
              <figcaption style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{p.guestName || '— без имени'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                  {p.dish?.nameRu || 'блюдо не указано'}
                  {p.guestHandle ? ` · ${p.guestHandle}` : ''}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginTop: '2px' }}>
                  {new Date(p.createdAt).toLocaleDateString('ru-RU')}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {status !== 'approved' && (
                    <button disabled={busyId === p.id} onClick={() => setPhotoStatus(p.id, 'approved')} style={btnPrimary}>Отобрать</button>
                  )}
                  {status === 'approved' && (
                    <button disabled={busyId === p.id} onClick={() => setPhotoStatus(p.id, 'printed')} style={btnPrimary}>Напечатано</button>
                  )}
                  {status !== 'rejected' && (
                    <button disabled={busyId === p.id} onClick={() => setPhotoStatus(p.id, 'rejected')} style={btn}>Отклонить</button>
                  )}
                  {status === 'rejected' && (
                    <button disabled={busyId === p.id} onClick={() => remove(p.id)} style={{ ...btn, color: 'var(--danger, var(--error))' }}>Удалить</button>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
