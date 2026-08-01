'use client';

import React from 'react';

export interface Step { textRu: string; textUz?: string | null; timerSeconds?: number | null }
export interface Ingredient { nameRu: string; nameUz?: string | null; amount?: string | null; productId?: string | null }
export interface Recipe {
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

export function AdminRecipeEditor({
  editing,
  products,
  busy,
  note,
  onUpdate,
  onSave,
  onCancel,
  onUploadHero,
}: {
  editing: Recipe;
  products: { id: string; nameRu: string }[];
  busy: boolean;
  note: string;
  onUpdate: (patch: Partial<Recipe>) => void;
  onSave: () => void;
  onCancel: () => void;
  onUploadHero: (file: File) => void;
}) {
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

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 780 }}>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
        {editing.id ? 'Правка рецепта' : 'Новый рецепт'}
      </h2>
      {note && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)', fontSize: 'var(--text-sm)' }}>
          {note}
        </div>
      )}

      <Field label="Название (рус)">
        <input style={inp} value={editing.titleRu} onChange={(e) => onUpdate({ titleRu: e.target.value })} />
      </Field>
      <Field label="Название (узб)">
        <input style={inp} value={editing.titleUz || ''} onChange={(e) => onUpdate({ titleUz: e.target.value })} />
      </Field>
      <Field label="Адрес страницы (slug)" hint="на него ведёт QR — менять у напечатанного рецепта нельзя">
        <input style={inp} value={editing.slug} onChange={(e) => onUpdate({ slug: e.target.value })} placeholder="samarqand-salati" />
      </Field>
      <Field label="Описание">
        <textarea style={{ ...inp, minHeight: 70 }} value={editing.descriptionRu || ''} onChange={(e) => onUpdate({ descriptionRu: e.target.value })} />
      </Field>

      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <Field label="Минут">
          <input style={inp} type="number" value={editing.cookMinutes ?? ''} onChange={(e) => onUpdate({ cookMinutes: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Порций">
          <input style={inp} type="number" value={editing.servings ?? ''} onChange={(e) => onUpdate({ servings: e.target.value ? Number(e.target.value) : null })} />
        </Field>
      </div>

      <Field label="Фото">
        {editing.heroImage && <img src={editing.heroImage} alt="" style={{ width: 180, borderRadius: 8, display: 'block', marginBottom: 8 }} />}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onUploadHero(e.target.files[0])} />
      </Field>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 'var(--space-4) 0' }}>
        <input type="checkbox" checked={editing.isActive} onChange={(e) => onUpdate({ isActive: e.target.checked })} />
        Опубликован
      </label>

      <h3 style={h3}>Ингредиенты</h3>
      {(editing.ingredients || []).map((ing, i) => (
        <div key={i} style={row}>
          <input style={{ ...inp, flex: 2 }} placeholder="Название (рус)" value={ing.nameRu}
                 onChange={(e) => onUpdate({ ingredients: editing.ingredients!.map((x, j) => j === i ? { ...x, nameRu: e.target.value } : x) })} />
          <input style={{ ...inp, flex: 1 }} placeholder="200 г" value={ing.amount || ''}
                 onChange={(e) => onUpdate({ ingredients: editing.ingredients!.map((x, j) => j === i ? { ...x, amount: e.target.value } : x) })} />
          <select style={{ ...inp, flex: 2 }} value={ing.productId || ''}
                  onChange={(e) => onUpdate({ ingredients: editing.ingredients!.map((x, j) => j === i ? { ...x, productId: e.target.value || null } : x) })}>
            <option value="">— не продаётся —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.nameRu}</option>)}
          </select>
          <button style={btn} onClick={() => onUpdate({ ingredients: editing.ingredients!.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button style={btn} onClick={() => onUpdate({ ingredients: [...(editing.ingredients || []), { nameRu: '', amount: '', productId: null }] })}>+ ингредиент</button>

      <h3 style={h3}>Шаги</h3>
      {(editing.steps || []).map((s, i) => (
        <div key={i} style={{ ...row, alignItems: 'flex-start' }}>
          <span style={{ paddingTop: 10, minWidth: 18, fontWeight: 700 }}>{i + 1}</span>
          <textarea style={{ ...inp, flex: 3, minHeight: 54 }} placeholder="Что делать" value={s.textRu}
                    onChange={(e) => onUpdate({ steps: editing.steps!.map((x, j) => j === i ? { ...x, textRu: e.target.value } : x) })} />
          <input style={{ ...inp, flex: 1 }} type="number" placeholder="таймер, сек" value={s.timerSeconds ?? ''}
                 onChange={(e) => onUpdate({ steps: editing.steps!.map((x, j) => j === i ? { ...x, timerSeconds: e.target.value ? Number(e.target.value) : null } : x) })} />
          <button style={btn} onClick={() => onUpdate({ steps: editing.steps!.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button style={btn} onClick={() => onUpdate({ steps: [...(editing.steps || []), { textRu: '', timerSeconds: null }] })}>+ шаг</button>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
        <button style={{ ...btn, ...btnPrimary }} disabled={busy} onClick={onSave}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <button style={btn} onClick={onCancel}>Отмена</button>
      </div>
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
