'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminClient';

/* ─────────────────────────────────────────────
   Рецепты: список + редактор (шаги с таймерами, ингредиенты с привязкой
   к товару магазина). Полный список шагов/ингредиентов шлём на PATCH —
   сервер пересобирает их целиком.
   ───────────────────────────────────────────── */

interface Step { textRu: string; textUz: string; image: string; timerSeconds: number | null }
interface Ingredient { nameRu: string; nameUz: string; amount: string; productId: string }
interface RecipeForm {
  id: string; slug: string; titleRu: string; titleUz: string;
  descriptionRu: string; heroImage: string;
  cookMinutes: number | null; servings: number | null; isActive: boolean;
  steps: Step[]; ingredients: Ingredient[];
}

const empty: RecipeForm = {
  id: '', slug: '', titleRu: '', titleUz: '', descriptionRu: '', heroImage: '',
  cookMinutes: null, servings: null, isActive: true, steps: [], ingredients: [],
};

export function RecipesTab() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState<RecipeForm>({ ...empty });
  const [editing, setEditing] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const r = await (await adminFetch('/api/admin/magazine/recipes')).json();
    setList(Array.isArray(r) ? r : []);
  }, []);

  useEffect(() => {
    load();
    // микрозелень для привязки ингредиентов
    fetch('/api/products?category=microgreens&all=true')
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d?.products) ? d.products : Array.isArray(d) ? d : []))
      .catch(() => setProducts([]));
  }, [load]);

  const edit = async (id: string) => {
    const r = await (await adminFetch(`/api/admin/magazine/recipes?id=${id}`)).json();
    setForm({
      id: r.id, slug: r.slug, titleRu: r.titleRu, titleUz: r.titleUz ?? '',
      descriptionRu: r.descriptionRu ?? '', heroImage: r.heroImage ?? '',
      cookMinutes: r.cookMinutes, servings: r.servings, isActive: r.isActive,
      steps: (r.steps ?? []).map((s: any) => ({ textRu: s.textRu, textUz: s.textUz ?? '', image: s.image ?? '', timerSeconds: s.timerSeconds })),
      ingredients: (r.ingredients ?? []).map((i: any) => ({ nameRu: i.nameRu, nameUz: i.nameUz ?? '', amount: i.amount ?? '', productId: i.productId ?? '' })),
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form.titleRu.trim()) return setMessage('Нужно название (ru)');
    const method = form.id ? 'PATCH' : 'POST';
    const res = await adminFetch('/api/admin/magazine/recipes', { method, body: JSON.stringify(form) });
    if (!res.ok) return setMessage(`Ошибка: ${res.status}`);
    setMessage('Сохранено');
    setForm({ ...empty });
    setEditing(false);
    await load();
  };

  const remove = async (id: string) => {
    await adminFetch(`/api/admin/magazine/recipes?id=${id}`, { method: 'DELETE' });
    await load();
  };

  const uploadImage = async (file: File, apply: (url: string) => void) => {
    const fd = new FormData();
    fd.append('file', file);
    const data = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
    if (data.url) apply(data.url);
    else setMessage(data.error ?? 'Не удалось загрузить фото');
  };

  const download = async (url: string, filename: string) => {
    const res = await adminFetch(url);
    if (!res.ok) return setMessage(`Ошибка QR: ${res.status}`);
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href; a.download = filename; a.click();
    URL.revokeObjectURL(href);
  };

  // ── список ──
  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <button onClick={() => { setForm({ ...empty }); setEditing(true); }} style={{ ...btn, background: 'var(--brand-primary)', color: '#fff' }}>
            + Новый рецепт
          </button>
        </div>
        {message && <div style={{ color: 'var(--text-secondary)' }}>{message}</div>}
        {list.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Рецептов пока нет.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th>Название</th><th>Шагов</th><th>Ингред.</th><th>Активен</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '6px 0' }}>{r.titleRu}</td>
                  <td>{r._count?.steps ?? 0}</td>
                  <td>{r._count?.ingredients ?? 0}</td>
                  <td>{r.isActive ? '✓' : '—'}</td>
                  <td style={{ display: 'flex', gap: 6, padding: '6px 0', flexWrap: 'wrap' }}>
                    <button onClick={() => edit(r.id)} style={btn}>Ред.</button>
                    <button onClick={() => download(`/api/admin/magazine/recipes/qr?slug=${r.slug}&format=png`, `qr-recipe-${r.slug}.png`)} style={btn}>QR PNG</button>
                    <button onClick={() => download(`/api/admin/magazine/recipes/qr?slug=${r.slug}&format=svg`, `qr-recipe-${r.slug}.svg`)} style={btn}>SVG</button>
                    <a href={`/recipe/${r.slug}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>↗</a>
                    <button onClick={() => remove(r.id)} style={{ ...btn, color: '#dc2626' }}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── редактор ──
  const setStep = (i: number, patch: Partial<Step>) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s) }));
  const setIng = (i: number, patch: Partial<Ingredient>) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((s, idx) => idx === i ? { ...s, ...patch } : s) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 720 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setEditing(false); setForm({ ...empty }); }} style={btn}>← Назад</button>
        <button onClick={save} style={{ ...btn, background: 'var(--brand-primary)', color: '#fff' }}>Сохранить</button>
        {message && <span style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}>{message}</span>}
      </div>

      <div style={grid2}>
        <Field label="Название (ru)"><input style={input} value={form.titleRu} onChange={(e) => setForm({ ...form, titleRu: e.target.value })} /></Field>
        <Field label="Название (uz)"><input style={input} value={form.titleUz} onChange={(e) => setForm({ ...form, titleUz: e.target.value })} /></Field>
        <Field label="Slug (пусто = из названия)"><input style={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
        <Field label="Активен"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /></Field>
        <Field label="Время (мин)"><input style={input} type="number" value={form.cookMinutes ?? ''} onChange={(e) => setForm({ ...form, cookMinutes: e.target.value ? Number(e.target.value) : null })} /></Field>
        <Field label="Порций"><input style={input} type="number" value={form.servings ?? ''} onChange={(e) => setForm({ ...form, servings: e.target.value ? Number(e.target.value) : null })} /></Field>
      </div>
      <Field label="Описание (ru)"><textarea style={{ ...input, minHeight: 60 }} value={form.descriptionRu} onChange={(e) => setForm({ ...form, descriptionRu: e.target.value })} /></Field>
      <Field label="Фото рецепта">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {form.heroImage && <img src={form.heroImage} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
          <label style={{ ...btn, cursor: 'pointer' }}>Загрузить<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, (url) => setForm((s) => ({ ...s, heroImage: url }))); }} /></label>
        </div>
      </Field>

      {/* Ингредиенты */}
      <div style={card}>
        <div style={rowBetween}><strong>Ингредиенты</strong><button onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { nameRu: '', nameUz: '', amount: '', productId: '' }] })} style={btn}>+ Ингредиент</button></div>
        {form.ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 6, marginTop: 8 }}>
            <input style={input} placeholder="Название (ru)" value={ing.nameRu} onChange={(e) => setIng(i, { nameRu: e.target.value })} />
            <input style={input} placeholder="Кол-во" value={ing.amount} onChange={(e) => setIng(i, { amount: e.target.value })} />
            <select style={input} value={ing.productId} onChange={(e) => setIng(i, { productId: e.target.value })}>
              <option value="">— не товар —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nameRu}</option>)}
            </select>
            <button onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, idx) => idx !== i) })} style={{ ...btn, color: '#dc2626' }}>✕</button>
          </div>
        ))}
      </div>

      {/* Шаги */}
      <div style={card}>
        <div style={rowBetween}><strong>Шаги</strong><button onClick={() => setForm({ ...form, steps: [...form.steps, { textRu: '', textUz: '', image: '', timerSeconds: null }] })} style={btn}>+ Шаг</button></div>
        {form.steps.map((s, i) => (
          <div key={i} style={{ marginTop: 10, padding: 10, border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <div style={rowBetween}><span style={{ color: 'var(--text-secondary)' }}>Шаг {i + 1}</span><button onClick={() => setForm({ ...form, steps: form.steps.filter((_, idx) => idx !== i) })} style={{ ...btn, color: '#dc2626' }}>✕</button></div>
            <textarea style={{ ...input, minHeight: 50, marginTop: 6 }} placeholder="Текст шага (ru)" value={s.textRu} onChange={(e) => setStep(i, { textRu: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input style={{ ...input, width: 140 }} type="number" placeholder="Таймер, сек" value={s.timerSeconds ?? ''} onChange={(e) => setStep(i, { timerSeconds: e.target.value ? Number(e.target.value) : null })} />
              {s.image && <img src={s.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />}
              <label style={{ ...btn, cursor: 'pointer' }}>Фото<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, (url) => setStep(i, { image: url })); }} /></label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

const btn: React.CSSProperties = { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' };
const input: React.CSSProperties = { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const card: React.CSSProperties = { padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', background: 'var(--bg-elevated)' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' };
const rowBetween: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
