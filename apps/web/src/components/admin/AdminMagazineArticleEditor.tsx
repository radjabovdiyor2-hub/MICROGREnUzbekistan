'use client';

import { RUBRICS, RECIPE_RUBRIC } from '@/lib/magazine/rubrics';
import type { MagazineArticle, MagazineArticleSection } from './magazineIssueTypes';

// Редактор материала: заголовок, обложка, секции (подзаголовок + текст +
// картинка) и то, куда материал ведёт — товар и номер.
//
// Разметку в текст не пускаем: секции — это структура, а не HTML, поэтому
// в тексте не может оказаться ни чужого скрипта, ни поехавшей вёрстки.
export function AdminMagazineArticleEditor({
  article, issues, products, busy, note, onUpdate, onSave, onCancel, onUploadImage,
}: {
  article: MagazineArticle;
  issues: { id: string; number: number; titleRu: string }[];
  products: { id: string; nameRu: string }[];
  busy: boolean;
  note: string;
  onUpdate: (patch: Partial<MagazineArticle>) => void;
  onSave: () => void;
  onCancel: () => void;
  onUploadImage: (file: File, sectionIndex: number | null) => void;
}) {
  const sections = article.sections ?? [];
  const label: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 4 };
  const row: React.CSSProperties = { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' };
  const field: React.CSSProperties = { flex: 1, minWidth: 200 };

  const patchSection = (index: number, patch: Partial<MagazineArticleSection>) => {
    onUpdate({ sections: sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: 820 }}>
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
        {article.id ? 'Правка материала' : 'Новый материал'}
      </h2>

      {note && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)', fontSize: 'var(--text-sm)' }}>
          {note}
        </div>
      )}

      <div style={row}>
        <div style={field}>
          <label style={label}>Рубрика</label>
          <select className="input" value={article.rubric} onChange={(e) => onUpdate({ rubric: e.target.value })}>
            {RUBRICS.filter((r) => r.id !== RECIPE_RUBRIC).map((r) => (
              <option key={r.id} value={r.id}>{r.emoji} {r.ru}</option>
            ))}
          </select>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Рубрика «Рецепты» наполняется на вкладке рецептов — у них свои шаги и корзина
          </div>
        </div>
        <div style={field}>
          <label style={label}>Адрес (slug)</label>
          <input className="input" value={article.slug} onChange={(e) => onUpdate({ slug: e.target.value })} />
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>Заголовок (рус.)</label>
          <input className="input" value={article.titleRu} onChange={(e) => onUpdate({ titleRu: e.target.value })} />
        </div>
        <div style={field}>
          <label style={label}>Sarlavha (uz)</label>
          <input className="input" value={article.titleUz ?? ''} onChange={(e) => onUpdate({ titleUz: e.target.value })} />
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>Анонс (рус.)</label>
          <textarea className="input" rows={2} value={article.excerptRu ?? ''}
            onChange={(e) => onUpdate({ excerptRu: e.target.value })} />
        </div>
        <div style={field}>
          <label style={label}>Anons (uz)</label>
          <textarea className="input" rows={2} value={article.excerptUz ?? ''}
            onChange={(e) => onUpdate({ excerptUz: e.target.value })} />
        </div>
      </div>

      <div style={row}>
        <div style={field}>
          <label style={label}>Обложка</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {article.coverImage
              ? <img src={article.coverImage} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8 }} />
              : <div style={{ width: 72, height: 54, borderRadius: 8, background: 'var(--bg-secondary)' }} />}
            <label className="btn btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
              ⬆ Загрузить
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f, null); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        <div style={field}>
          <label style={label}>Из номера</label>
          <select className="input" value={article.issueId ?? ''}
            onChange={(e) => onUpdate({ issueId: e.target.value || null })}>
            <option value="">— вне номера —</option>
            {issues.map((i) => <option key={i.id} value={i.id}>№{i.number} · {i.titleRu}</option>)}
          </select>
        </div>
        <div style={field}>
          <label style={label}>Товар материала</label>
          <select className="input" value={article.productId ?? ''}
            onChange={(e) => onUpdate({ productId: e.target.value || null })}>
            <option value="">— без товара —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.nameRu}</option>)}
          </select>
        </div>
      </div>

      <h3 style={{ fontWeight: 'var(--font-bold)', margin: 'var(--space-4) 0 var(--space-2)' }}>Текст материала</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {sections.map((s, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={row}>
              <div style={field}>
                <input className="input" placeholder="Подзаголовок (рус.)" value={s.headingRu ?? ''}
                  onChange={(e) => patchSection(i, { headingRu: e.target.value })} />
              </div>
              <div style={field}>
                <input className="input" placeholder="Sarlavha (uz)" value={s.headingUz ?? ''}
                  onChange={(e) => patchSection(i, { headingUz: e.target.value })} />
              </div>
            </div>
            <textarea className="input" rows={4} placeholder="Текст по-русски" value={s.textRu}
              style={{ marginBottom: 'var(--space-2)' }}
              onChange={(e) => patchSection(i, { textRu: e.target.value })} />
            <textarea className="input" rows={3} placeholder="Matn (uz)" value={s.textUz ?? ''}
              onChange={(e) => patchSection(i, { textUz: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
              {s.image && <img src={s.image} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6 }} />}
              <label className="btn btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
                ⬆ Картинка
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f, i); e.target.value = ''; }} />
              </label>
              <button className="btn btn-sm" style={{ color: 'var(--error)' }}
                onClick={() => onUpdate({ sections: sections.filter((_, k) => k !== i) })}>
                Убрать блок
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-sm" style={{ marginTop: 'var(--space-3)' }}
        onClick={() => onUpdate({ sections: [...sections, { headingRu: '', textRu: '', textUz: '' }] })}>
        + Блок текста
      </button>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 'var(--space-4) 0' }}>
        <input type="checkbox" checked={article.isPublished}
          onChange={(e) => onUpdate({ isPublished: e.target.checked })} />
        <span>Опубликован — виден в журнале на сайте</span>
      </label>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-primary" disabled={busy} onClick={onSave}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
