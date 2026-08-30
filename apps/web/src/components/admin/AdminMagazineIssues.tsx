'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, EyeOff, ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import { AdminMagazineIssueEditor } from './AdminMagazineIssueEditor';
import { emptyIssue, type MagazineIssue } from './magazineIssueTypes';

// ══════════════════════════════════════════════════════════════════════
// Номера журнала: завести карточку и опубликовать.
//
// ЧТО УБРАНО. Конвейер из трёх задач («подготовить следующий», «опубликовать
// выпуск», «посчитать тираж»), переписывание блоков ИИ и сводка недели.
// Номер собирается руками — вёрстка, сверки, публикация скриптом в
// public/magazine, — и системе остаётся знать о нём и показать его.
// Счёт за тираж считается на вкладке «Тираж и реклама», по вышедшему номеру.
// ══════════════════════════════════════════════════════════════════════
export function AdminMagazineIssues({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [editing, setEditing] = useState<MagazineIssue | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data: issues = [], isPending } = useQuery<MagazineIssue[]>({
    queryKey: ['admin-magazine-issues'],
    queryFn: () => adminJsonArray<MagazineIssue>('/api/admin/magazine/issues'),
  });

  const { data: restaurants = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['admin-magazine-restaurants'],
    queryFn: () => adminJsonArray<{ id: string; name: string }>('/api/admin/magazine/restaurants'),
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ['admin-magazine-issues'] });

  const openEditor = async (id: string | null) => {
    setNote('');
    if (!id) {
      const next = issues.reduce((max, i) => Math.max(max, i.number), 0) + 1;
      setEditing(emptyIssue(next));
      return;
    }
    const res = await adminFetch(`/api/admin/magazine/issues?id=${id}`);
    if (!res.ok) { setError(t('Не удалось загрузить номер', 'Sonni yuklab boʻlmadi')); return; }
    setEditing(await res.json());
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.titleRu.trim()) { setNote('Название по-русски обязательно'); return; }
    setBusy(true);
    setNote('');
    const body = {
      number: editing.number,
      slug: editing.slug || undefined,
      titleRu: editing.titleRu,
      titleUz: editing.titleUz,
      summaryRu: editing.summaryRu,
      summaryUz: editing.summaryUz,
      coverImage: editing.coverImage,
      webUrl: editing.webUrl,
      pdfUrl: editing.pdfUrl,
      topics: editing.topics,
      restaurantId: editing.restaurantId,
      isPublished: editing.isPublished,
    };
    try {
      const res = editing.id
        ? await adminFetch('/api/admin/magazine/issues', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...body }) })
        : await adminFetch('/api/admin/magazine/issues', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        setNote(e?.error || 'Не удалось сохранить');
        return;
      }
      setEditing(null);
      reload();
    } finally { setBusy(false); }
  };

  const uploadFile = async (field: 'coverImage' | 'pdfUrl', file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (!data?.url) { setNote(data?.error || 'Ошибка загрузки файла'); return; }
      setEditing((p) => (p ? { ...p, [field]: data.url } : p));
    } finally { setBusy(false); }
  };

  const togglePublish = async (issue: MagazineIssue) => {
    setError('');
    const res = await adminFetch('/api/admin/magazine/issues', {
      method: 'PATCH',
      body: JSON.stringify({ id: issue.id, isPublished: !issue.isPublished }),
    });
    if (!res.ok) { setError(t('Не удалось изменить номер', 'Sonni oʻzgartirib boʻlmadi')); return; }
    notify.success(issue.isPublished
      ? t('Номер снят с публикации', 'Son eʼlondan olindi')
      : t('Номер опубликован', 'Son eʼlon qilindi'));
    reload();
  };

  const remove = async (issue: MagazineIssue) => {
    const agreed = await notify.confirm({
      title: `Удалить номер №${issue.number}?`,
      detail: 'Карточка исчезнет с сайта и из бота. Файлы вёрстки и PDF останутся на месте.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!agreed) return;
    const res = await adminFetch(`/api/admin/magazine/issues?id=${issue.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      setError(e?.error || 'Не удалось удалить');
      return;
    }
    reload();
  };

  if (editing) {
    return (
      <AdminMagazineIssueEditor
        issue={editing}
        restaurants={restaurants}
        busy={busy}
        note={note}
        onUpdate={(patch) => setEditing((p) => (p ? { ...p, ...patch } : p))}
        onSave={save}
        onCancel={() => { setEditing(null); setNote(''); }}
        onUploadFile={uploadFile}
      />
    );
  }

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={22} /> {t('Номера журнала', 'Jurnal sonlari')}
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={reload} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('Обновить', 'Yangilash')}
        </button>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)', maxWidth: 620 }}>
        {t(
          'Номер верстается вручную и публикуется скриптом в public/magazine. Здесь — карточка номера: название, обложка, ссылки на вёрстку и PDF, публикация.',
          'Son qoʻlda tayyorlanadi. Bu yerda — son kartochkasi va eʼlon qilish.',
        )}
      </p>

      <AdminNotice>{error}</AdminNotice>

      <button className="btn btn-primary" style={{ marginBottom: 'var(--space-4)' }} onClick={() => openEditor(null)}>
        + {t('Новый номер', 'Yangi son')}
      </button>

      {isPending && <div style={{ color: 'var(--text-muted)' }}>{t('Загрузка…', 'Yuklanmoqda…')}</div>}

      {!isPending && issues.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('Номеров нет. Заведите карточку вышедшего номера.', 'Sonlar yoʻq.')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {issues.map((i) => (
          <div key={i.id} className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {i.coverImage
              ? <img src={i.coverImage} alt="" style={{ width: 48, height: 66, objectFit: 'cover', borderRadius: 6 }} />
              : <div style={{ width: 48, height: 66, borderRadius: 6, background: 'var(--bg-secondary)' }} />}

            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 'var(--font-bold)' }}>#{i.number} · {i.titleRu}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {i.restaurant?.name || t('общий номер', 'umumiy son')}
                {i._count?.articles ? ` · ${t('материалов', 'material')}: ${i._count.articles}` : ''}
              </div>
            </div>

            <span style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold',
              background: i.isPublished ? 'var(--success-bg)' : 'var(--bg-secondary)',
              color: i.isPublished ? 'var(--success)' : 'var(--text-muted)',
            }}>
              {i.isPublished ? t('опубликован', 'eʼlon qilingan') : t('черновик', 'qoralama')}
            </span>

            {i.webUrl && (
              <a className="btn btn-ghost btn-sm" href={i.webUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={14} /> {t('Открыть', 'Ochish')}
              </a>
            )}
            <button className="btn btn-sm" onClick={() => togglePublish(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
              {i.isPublished ? t('Снять', 'Olib qoʻyish') : t('Опубликовать', 'Eʼlon qilish')}
            </button>
            <button className="btn btn-sm" onClick={() => openEditor(i.id)}>{t('Правка', 'Tahrir')}</button>
            <button className="btn btn-sm" style={{ color: 'var(--error)' }} onClick={() => remove(i)}>
              {t('Удалить', 'Oʻchirish')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
