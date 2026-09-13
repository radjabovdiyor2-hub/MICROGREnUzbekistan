'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { useFeedback } from './AdminFeedback';
import { AdminRecipeEditor, type Recipe } from './AdminRecipeEditor';

const T = {
  loadFailed: { ru: 'Не удалось загрузить рецепт', uz: "Retseptni yuklab bo'lmadi" },
  needTitle: { ru: 'Название по-русски обязательно', uz: "Ruscha nomi majburiy" },
  saveFailed: { ru: 'Не удалось сохранить', uz: "Saqlab bo'lmadi" },
  removeHint: { ru: 'QR, который ведёт на этот рецепт, перестанет работать.', uz: "Bu retseptga olib boradigan QR ishlamay qoladi." },
  remove: { ru: 'Удалить', uz: "O'chirish" },
  removing: { ru: 'Удаляю рецепт…', uz: "Retsept o'chirilmoqda…" },
  undone: { ru: 'Отменено — рецепт на месте', uz: 'Bekor qilindi — retsept joyida' },
  removeFailed: { ru: 'Не удалось удалить', uz: "O'chirib bo'lmadi" },
  uploadFailed: { ru: 'Ошибка загрузки файла', uz: 'Faylni yuklashda xato' },
  qrFailed: { ru: 'Не удалось получить QR', uz: "QR olib bo'lmadi" },
  title: { ru: '🥗 Рецепты', uz: '🥗 Retseptlar' },
  hint: {
    ru: 'Страницы, на которые ведут QR из журнала. Адрес (slug) у напечатанного рецепта менять нельзя — код на бумаге не переделать. Ингредиент, связанный с товаром, попадает в кнопку «собрать набор».',
    uz: "Jurnaldagi QR olib boradigan sahifalar. Chop etilgan retseptning manzilini (slug) o'zgartirib bo'lmaydi — qog'ozdagi kodni qayta yasab bo'lmaydi. Mahsulotga bog'langan masalliq «to'plamni yig'ish» tugmasiga tushadi.",
  },
  newRecipe: { ru: '+ Новый рецепт', uz: '+ Yangi retsept' },
  loading: { ru: 'Загрузка…', uz: 'Yuklanmoqda…' },
  draft: { ru: '· черновик', uz: '· qoralama' },
  steps: { ru: 'шагов', uz: 'qadam' },
  ingredients: { ru: 'ингредиент', uz: 'masalliq' },
  minutes: { ru: 'мин', uz: 'daqiqa' },
  open: { ru: 'Открыть ↗', uz: 'Ochish ↗' },
  edit: { ru: 'Правка', uz: 'Tahrirlash' },
};

const removeTitle = {
  ru: (title: string) => `Удалить «${title}»?`,
  uz: (title: string) => `«${title}» o'chirilsinmi?`,
};

export function AdminRecipes({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const { data: list = [], isLoading: loading } = useQuery<Recipe[]>({
    queryKey: ['magazine-recipes'],
    queryFn: async () => {
      return await adminJsonArray<Recipe>('/api/admin/magazine/recipes');
    }
  });

  const { data: products = [] } = useQuery<{ id: string; nameRu: string }[]>({
    queryKey: ['products-list'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/products?all=true&limit=300');
        const data = await res.json().catch(() => null);
        const items: unknown[] = Array.isArray(data?.items) ? data.items : [];
        return items.map((x) => {
          const p = x as { id: string; nameRu?: string; slug?: string };
          return { id: p.id, nameRu: p.nameRu || p.slug || p.id };
        });
      } catch { return []; }
    }
  });

  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: ['magazine-recipes'] });
  };

  const openEditor = async (id: string | null) => {
    setNote('');
    if (!id) {
      setEditing({
        id: '', slug: '', titleRu: '', titleUz: '', descriptionRu: '',
        heroImage: null, cookMinutes: 15, servings: 2, isActive: true,
        steps: [{ textRu: '', textUz: '', timerSeconds: null }],
        ingredients: [{ nameRu: '', nameUz: '', amount: '', productId: null }],
      });
      return;
    }
    const res = await adminFetch(`/api/admin/magazine/recipes?id=${id}`);
    if (!res.ok) { setNote(t('loadFailed')); return; }
    const r = await res.json();
    setEditing({ ...r, steps: r.steps?.length ? r.steps : [{ textRu: '' }], ingredients: r.ingredients?.length ? r.ingredients : [{ nameRu: '' }] });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.titleRu.trim()) { setNote(t('needTitle')); return; }
    setBusy(true);
    setNote('');
    try {
      const body: Omit<Recipe, 'id' | '_count'> = {
        titleRu: editing.titleRu, titleUz: editing.titleUz, slug: editing.slug || editing.titleRu,
        descriptionRu: editing.descriptionRu, heroImage: editing.heroImage,
        cookMinutes: editing.cookMinutes, servings: editing.servings, isActive: editing.isActive,
        steps: (editing.steps || []).filter((s) => s.textRu.trim()),
        ingredients: (editing.ingredients || []).filter((i) => i.nameRu.trim()),
      };
      const res = editing.id
        ? await adminFetch('/api/admin/magazine/recipes', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...body }) })
        : await adminFetch('/api/admin/magazine/recipes', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        setNote(e?.error || t('saveFailed'));
        return;
      }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: string, title: string) => {
    const agreed = await notify.confirm({
      title: removeTitle[lang](title),
      // Последствие снаружи системы: напечатанный QR на упаковке уже ушёл
      // к клиентам, и вернуть его нельзя.
      detail: t('removeHint'),
      confirmText: t('remove'),
      danger: true,
    });
    if (!agreed) return;
    notify.undoable({
      text: t('removing'),
      undoneText: t('undone'),
      run: async () => {
        const res = await adminFetch(`/api/admin/magazine/recipes?id=${id}`, { method: 'DELETE' });
        if (!res.ok) { setNote(t('removeFailed')); return; }
        await load();
      },
    });
  };

  const uploadHero = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!data?.url) { setNote(data?.error || t('uploadFailed')); return; }
      setEditing((p) => (p ? { ...p, heroImage: data.url } : p));
    } finally { setBusy(false); }
  };

  const downloadQr = async (slug: string) => {
    const res = await adminFetch(`/api/admin/magazine/recipes/qr?slug=${encodeURIComponent(slug)}&format=svg`);
    if (!res.ok) { setNote(t('qrFailed')); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-recipe-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upd = (patch: Partial<Recipe>) => setEditing((p) => (p ? { ...p, ...patch } : p));

  // Высота задана здесь, а не общим правилом для телефона: в этом ряду
  // рядом с тремя кнопками стоит ссылка «Открыть», и правило про кнопки её
  // не достаёт — ряд выходил разноростым. Ссылке нужен и flex: без него
  // высоту она примет, а текст в ней съедет вверх.
  const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
    color: 'var(--text-primary)', whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36,
  };
  const btnPrimary: React.CSSProperties = { border: '1px solid var(--brand-primary)', background: 'var(--brand-primary)', color: 'var(--text-inverse)' };

  if (editing) {
    return (
      <AdminRecipeEditor
        editing={editing}
        products={products}
        busy={busy}
        note={note}
        onUpdate={upd}
        onSave={save}
        onCancel={() => { setEditing(null); setNote(''); }}
        onUploadHero={uploadHero}
      />
    );
  }

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 900 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)' }}>{t('title')}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', maxWidth: 620 }}>
        {t('hint')}
      </p>

      {note && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)', fontSize: 'var(--text-sm)' }}>
          {note}
        </div>
      )}
      <button style={{ ...btn, ...btnPrimary, marginBottom: 'var(--space-4)' }} onClick={() => openEditor(null)}>{t('newRecipe')}</button>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>{t('loading')}</div>
      ) : list.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          Рецептов нет. Если в журнале уже напечатан QR на рецепт — его страница отдаёт 404.
          Для номера №1 есть готовый сид:{' '}
          <code>npx tsx prisma/seed-recipe-samarqand-salati.ts</code>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {list.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
              {r.heroImage
                ? <img src={r.heroImage} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                : <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--bg-secondary)' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {r.titleRu} {!r.isActive && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{t('draft')}</span>}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                  /recipe/{r.slug} · {t('steps')} {r._count?.steps ?? 0} · {t('ingredients')} {r._count?.ingredients ?? 0}
                  {r.cookMinutes ? ` · ${r.cookMinutes} ${t('minutes')}` : ''}
                </div>
              </div>
              <a href={`/recipe/${r.slug}`} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>{t('open')}</a>
              <button style={btn} onClick={() => downloadQr(r.slug)}>⬇ QR</button>
              <button style={btn} onClick={() => openEditor(r.id)}>{t('edit')}</button>
              <button style={{ ...btn, color: 'var(--error)' }} onClick={() => remove(r.id, r.titleRu)}>{t('remove')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
