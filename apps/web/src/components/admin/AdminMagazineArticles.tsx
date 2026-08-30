'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { useFeedback } from './AdminFeedback';
import { AdminNotice } from './AdminNotice';
import { AdminMagazineArticleEditor } from './AdminMagazineArticleEditor';
import { emptyArticle, type MagazineArticle } from './magazineIssueTypes';
import { findRubric, RUBRICS, RECIPE_RUBRIC } from '@/lib/magazine/rubrics';

// ══════════════════════════════════════════════════════════════════════
// Материалы журнала: страницы рубрик на сайте.
//
// ЗАЧЕМ ОНИ ВООБЩЕ. Номер выходит раз в несколько недель и живёт файлом;
// между номерами разделу нечего показать, а поиску — нечего индексировать.
// Материал публикуется в любой день и попадает в свою рубрику.
// ══════════════════════════════════════════════════════════════════════
export function AdminMagazineArticles() {
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MagazineArticle | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data: list = [], isPending } = useQuery<MagazineArticle[]>({
    queryKey: ['admin-magazine-articles'],
    queryFn: () => adminJsonArray<MagazineArticle>('/api/admin/magazine/articles'),
  });

  const { data: issues = [] } = useQuery<{ id: string; number: number; titleRu: string }[]>({
    queryKey: ['admin-magazine-issues'],
    queryFn: () => adminJsonArray<{ id: string; number: number; titleRu: string }>('/api/admin/magazine/issues'),
  });

  const { data: products = [] } = useQuery<{ id: string; nameRu: string }[]>({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await fetch('/api/products?all=true&limit=300');
      const data = await res.json().catch(() => null);
      const items: unknown[] = Array.isArray(data?.items) ? data.items : [];
      return items.map((x) => {
        const p = x as { id: string; nameRu?: string; slug?: string };
        return { id: p.id, nameRu: p.nameRu || p.slug || p.id };
      });
    },
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ['admin-magazine-articles'] });

  const openEditor = async (id: string | null) => {
    setNote('');
    if (!id) {
      const first = RUBRICS.find((r) => r.id !== RECIPE_RUBRIC);
      setEditing(emptyArticle(first ? first.id : 'health'));
      return;
    }
    const res = await adminFetch(`/api/admin/magazine/articles?id=${id}`);
    if (!res.ok) { setError('Не удалось загрузить материал'); return; }
    const article = await res.json();
    setEditing({ ...article, sections: article.sections?.length ? article.sections : [{ textRu: '' }] });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.titleRu.trim()) { setNote('Заголовок по-русски обязателен'); return; }
    const sections = (editing.sections ?? []).filter((s) => s.textRu.trim());
    if (sections.length === 0) { setNote('Нужен хотя бы один блок текста'); return; }

    setBusy(true);
    setNote('');
    const body = {
      slug: editing.slug || undefined,
      rubric: editing.rubric,
      titleRu: editing.titleRu,
      titleUz: editing.titleUz,
      excerptRu: editing.excerptRu,
      excerptUz: editing.excerptUz,
      coverImage: editing.coverImage,
      issueId: editing.issueId,
      productId: editing.productId,
      isPublished: editing.isPublished,
      sortOrder: editing.sortOrder,
      sections,
    };
    try {
      const res = editing.id
        ? await adminFetch('/api/admin/magazine/articles', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...body }) })
        : await adminFetch('/api/admin/magazine/articles', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        setNote(e?.error || 'Не удалось сохранить');
        return;
      }
      setEditing(null);
      reload();
    } finally { setBusy(false); }
  };

  const uploadImage = async (file: File, sectionIndex: number | null) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (!data?.url) { setNote(data?.error || 'Ошибка загрузки файла'); return; }
      setEditing((p) => {
        if (!p) return p;
        if (sectionIndex === null) return { ...p, coverImage: data.url };
        const sections = (p.sections ?? []).map((s, i) => (i === sectionIndex ? { ...s, image: data.url } : s));
        return { ...p, sections };
      });
    } finally { setBusy(false); }
  };

  const remove = async (article: MagazineArticle) => {
    const agreed = await notify.confirm({
      title: `Удалить «${article.titleRu}»?`,
      detail: 'Страница материала перестанет открываться, ссылки на неё станут битыми.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!agreed) return;
    const res = await adminFetch(`/api/admin/magazine/articles?id=${article.id}`, { method: 'DELETE' });
    if (!res.ok) { setError('Не удалось удалить'); return; }
    reload();
  };

  if (editing) {
    return (
      <AdminMagazineArticleEditor
        article={editing}
        issues={issues}
        products={products}
        busy={busy}
        note={note}
        onUpdate={(patch) => setEditing((p) => (p ? { ...p, ...patch } : p))}
        onSave={save}
        onCancel={() => { setEditing(null); setNote(''); }}
        onUploadImage={uploadImage}
      />
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', maxWidth: 620 }}>
        Страницы журнала по темам: здоровье, рестораны, советы хозяйке, скидки и наборы, ферма.
        Адрес материала — /magazine/&lt;рубрика&gt;/&lt;slug&gt;.
      </p>

      <AdminNotice>{error}</AdminNotice>

      <button className="btn btn-primary" style={{ marginBottom: 'var(--space-4)' }} onClick={() => openEditor(null)}>
        + Новый материал
      </button>

      {isPending && <div style={{ color: 'var(--text-muted)' }}>Загрузка…</div>}

      {!isPending && list.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          Материалов нет. Пока их нет, рубрики на сайте показываются пустыми.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {list.map((a) => {
          const rubric = findRubric(a.rubric);
          return (
            <div key={a.id} className="card" style={{ padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              {a.coverImage
                ? <img src={a.coverImage} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                : <div style={{ width: 64, height: 48, borderRadius: 8, background: 'var(--bg-secondary)' }} />}

              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>
                  {a.titleRu}{' '}
                  {!a.isPublished && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· черновик</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                  {rubric ? `${rubric.emoji} ${rubric.ru}` : a.rubric} · /magazine/{a.rubric}/{a.slug}
                  {a.issue ? ` · из №${a.issue.number}` : ''}
                </div>
              </div>

              <a className="btn btn-sm" href={`/magazine/${a.rubric}/${a.slug}`} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}>
                Открыть ↗
              </a>
              <button className="btn btn-sm" onClick={() => openEditor(a.id)}>Правка</button>
              <button className="btn btn-sm" style={{ color: 'var(--error)' }} onClick={() => remove(a)}>Удалить</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
