'use client';

// ══════════════════════════════════════════════════════════════════════
// Рецепты: то, куда ведёт QR с полосы журнала.
//
// Экрана не было, хотя API рецептов существует давно
// (api/admin/magazine/recipes: GET/POST/PATCH/DELETE со шагами,
// ингредиентами, heroImage и isActive, плюс recipes/qr для кода).
// Последствие было прямым: рецепты в базе создавались только запросом
// в API руками, поэтому таблица оставалась пустой — и QR с полосы 5
// напечатанного номера №1 вёл на 404.
//
// Ингредиент можно связать с товаром магазина: тогда на публичной
// странице работает кнопка «собрать набор» — ингредиенты уходят
// в корзину. Связывать имеет смысл только продаваемое (микрозелень),
// томаты и масло оставляйте без товара.
// ══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { adminFetch, adminJsonArray } from '@/lib/adminClient';

interface Step { textRu: string; textUz?: string | null; timerSeconds?: number | null }
interface Ingredient { nameRu: string; nameUz?: string | null; amount?: string | null; productId?: string | null }
interface Recipe {
  id: string;
  slug: string;
  titleRu: string;
  titleUz: string | null;
  descriptionRu: string | null;
  heroImage: string | null;
  cookMinutes: number | null;
  servings: number | null;
  isActive: boolean;
  steps?: Step[];
  ingredients?: Ingredient[];
  _count?: { steps: number; ingredients: number };
}

export function AdminRecipes() {
  const [list, setList] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<{ id: string; nameRu: string }[]>([]);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await adminJsonArray<Recipe>('/api/admin/magazine/recipes'));
      // Товары нужны, чтобы связать продаваемый ингредиент с корзиной.
      // Эндпоинт отдаёт { items, pagination }, а не массив — adminJsonArray
      // здесь не подходит, он вернул бы пустой список и селект был бы пуст.
      try {
        const res = await fetch('/api/products?all=true&limit=300');
        const data = await res.json().catch(() => null);
        const items: unknown[] = Array.isArray(data?.items) ? data.items : [];
        setProducts(items.map((x) => {
          const p = x as { id: string; nameRu?: string; slug?: string };
          return { id: p.id, nameRu: p.nameRu || p.slug || p.id };
        }));
      } catch {
        /* без товаров редактор работает, просто нельзя связать ингредиент */
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    if (!res.ok) { setNote('Не удалось загрузить рецепт'); return; }
    const r = await res.json();
    setEditing({ ...r, steps: r.steps?.length ? r.steps : [{ textRu: '' }], ingredients: r.ingredients?.length ? r.ingredients : [{ nameRu: '' }] });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.titleRu.trim()) { setNote('Название по-русски обязательно'); return; }
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
        setNote(e?.error || 'Не удалось сохранить');
        return;
      }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Удалить «${title}»? QR, который ведёт на этот рецепт, перестанет работать.`)) return;
    const res = await adminFetch(`/api/admin/magazine/recipes?id=${id}`, { method: 'DELETE' });
    if (!res.ok) { setNote('Не удалось удалить'); return; }
    await load();
  };

  // Фото рецепта — тем же путём, что видео блюд в разделе «Журнал»
  const uploadHero = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!data?.url) { setNote(data?.error || 'Ошибка загрузки файла'); return; }
      setEditing((p) => (p ? { ...p, heroImage: data.url } : p));
    } finally { setBusy(false); }
  };

  const downloadQr = async (slug: string) => {
    const res = await adminFetch(`/api/admin/magazine/recipes/qr?slug=${encodeURIComponent(slug)}&format=svg`);
    if (!res.ok) { setNote('Не удалось получить QR'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-recipe-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upd = (patch: Partial<Recipe>) => setEditing((p) => (p ? { ...p, ...patch } : p));

  // ── редактор ──
  if (editing) {
    return (
      <div style={{ padding: 'var(--space-6)', maxWidth: 780 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
          {editing.id ? 'Правка рецепта' : 'Новый рецепт'}
        </h2>
        {note && <div style={warnBox}>{note}</div>}

        <Field label="Название (рус)"><input style={inp} value={editing.titleRu} onChange={(e) => upd({ titleRu: e.target.value })} /></Field>
        <Field label="Название (узб)"><input style={inp} value={editing.titleUz || ''} onChange={(e) => upd({ titleUz: e.target.value })} /></Field>
        <Field label="Адрес страницы (slug)" hint="на него ведёт QR — менять у напечатанного рецепта нельзя">
          <input style={inp} value={editing.slug} onChange={(e) => upd({ slug: e.target.value })} placeholder="samarqand-salati" />
        </Field>
        <Field label="Описание"><textarea style={{ ...inp, minHeight: 70 }} value={editing.descriptionRu || ''} onChange={(e) => upd({ descriptionRu: e.target.value })} /></Field>

        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <Field label="Минут"><input style={inp} type="number" value={editing.cookMinutes ?? ''} onChange={(e) => upd({ cookMinutes: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Порций"><input style={inp} type="number" value={editing.servings ?? ''} onChange={(e) => upd({ servings: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>

        <Field label="Фото">
          {editing.heroImage && <img src={editing.heroImage} alt="" style={{ width: 180, borderRadius: 8, display: 'block', marginBottom: 8 }} />}
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadHero(e.target.files[0])} />
        </Field>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 'var(--space-4) 0' }}>
          <input type="checkbox" checked={editing.isActive} onChange={(e) => upd({ isActive: e.target.checked })} />
          Опубликован
        </label>

        <h3 style={h3}>Ингредиенты</h3>
        {(editing.ingredients || []).map((ing, i) => (
          <div key={i} style={row}>
            <input style={{ ...inp, flex: 2 }} placeholder="Название (рус)" value={ing.nameRu}
                   onChange={(e) => upd({ ingredients: editing.ingredients!.map((x, j) => j === i ? { ...x, nameRu: e.target.value } : x) })} />
            <input style={{ ...inp, flex: 1 }} placeholder="200 г" value={ing.amount || ''}
                   onChange={(e) => upd({ ingredients: editing.ingredients!.map((x, j) => j === i ? { ...x, amount: e.target.value } : x) })} />
            <select style={{ ...inp, flex: 2 }} value={ing.productId || ''}
                    onChange={(e) => upd({ ingredients: editing.ingredients!.map((x, j) => j === i ? { ...x, productId: e.target.value || null } : x) })}>
              <option value="">— не продаётся —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nameRu}</option>)}
            </select>
            <button style={btn} onClick={() => upd({ ingredients: editing.ingredients!.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button style={btn} onClick={() => upd({ ingredients: [...(editing.ingredients || []), { nameRu: '', amount: '', productId: null }] })}>+ ингредиент</button>

        <h3 style={h3}>Шаги</h3>
        {(editing.steps || []).map((s, i) => (
          <div key={i} style={{ ...row, alignItems: 'flex-start' }}>
            <span style={{ paddingTop: 10, minWidth: 18, fontWeight: 700 }}>{i + 1}</span>
            <textarea style={{ ...inp, flex: 3, minHeight: 54 }} placeholder="Что делать" value={s.textRu}
                      onChange={(e) => upd({ steps: editing.steps!.map((x, j) => j === i ? { ...x, textRu: e.target.value } : x) })} />
            <input style={{ ...inp, flex: 1 }} type="number" placeholder="таймер, сек" value={s.timerSeconds ?? ''}
                   onChange={(e) => upd({ steps: editing.steps!.map((x, j) => j === i ? { ...x, timerSeconds: e.target.value ? Number(e.target.value) : null } : x) })} />
            <button style={btn} onClick={() => upd({ steps: editing.steps!.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button style={btn} onClick={() => upd({ steps: [...(editing.steps || []), { textRu: '', timerSeconds: null }] })}>+ шаг</button>

        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <button style={{ ...btn, ...btnPrimary }} disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
          <button style={btn} onClick={() => { setEditing(null); setNote(''); }}>Отмена</button>
        </div>
      </div>
    );
  }

  // ── список ──
  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 900 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)' }}>🥗 Рецепты</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', maxWidth: 620 }}>
        Страницы, на которые ведут QR из журнала. Адрес (slug) у напечатанного рецепта менять нельзя —
        код на бумаге не переделать. Ингредиент, связанный с товаром, попадает в кнопку «собрать набор».
      </p>

      {note && <div style={warnBox}>{note}</div>}
      <button style={{ ...btn, ...btnPrimary, marginBottom: 'var(--space-4)' }} onClick={() => openEditor(null)}>+ Новый рецепт</button>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Загрузка…</div>
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
                  {r.titleRu} {!r.isActive && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>· черновик</span>}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                  /recipe/{r.slug} · шагов {r._count?.steps ?? 0} · ингредиентов {r._count?.ingredients ?? 0}
                  {r.cookMinutes ? ` · ${r.cookMinutes} мин` : ''}
                </div>
              </div>
              <a href={`/recipe/${r.slug}`} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: 'none' }}>Открыть ↗</a>
              <button style={btn} onClick={() => downloadQr(r.slug)}>⬇ QR</button>
              <button style={btn} onClick={() => openEditor(r.id)}>Правка</button>
              <button style={{ ...btn, color: 'var(--error)' }} onClick={() => remove(r.id, r.titleRu)}>Удалить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-3)', flex: 1 }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border-color)', background: 'transparent',
  color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
};
const btn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
  color: 'var(--text-primary)', whiteSpace: 'nowrap',
};
const btnPrimary: React.CSSProperties = { border: '1px solid var(--brand-primary)', background: 'var(--brand-primary)', color: 'var(--text-inverse)' };
const h3: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 700, margin: 'var(--space-5) 0 var(--space-2)' };
const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 };
const warnBox: React.CSSProperties = {
  marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 8,
  background: 'var(--bg-secondary)', fontSize: 'var(--text-sm)',
};
