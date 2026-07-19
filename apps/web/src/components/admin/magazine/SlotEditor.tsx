'use client';

import React, { useState } from 'react';
import { SECTION_TITLES } from '@/lib/magazine/types';
import { adminFetch } from '@/lib/adminClient';

// Контекст для ИИ-черновика (ресторан/меню/тема недели)
export interface AiContext {
  restaurantName?: string;
  menuItems?: string[];
  weekTheme?: string;
  city?: string;
}

// Генеричный редактор слотов: превращает блоки спеки в редактируемые поля.
// Работает с любым типом блока (строки, числа, массивы строк, массивы объектов).

const LABELS: Record<string, string> = {
  title: 'Заголовок', accentTitle: 'Цветная часть', subtitle: 'Подзаголовок', text: 'Текст',
  fact: 'Факт', factTitle: 'Заголовок факта', advice: 'Совет', trendQuery: 'Тренд-запрос Google',
  editorialNote: 'Слово от редакции', chefName: 'Имя шефа', name: 'Название', meta: 'Подпись/мета',
  pullQuote: 'Цитата', quoteAttr: 'Автор цитаты', whatToOrder: 'Что заказать', rating: 'Рейтинг',
  intro: 'Вступление', chefVersion: 'Версия шефа', homeVersion: 'Версия для дома',
  tableTitle: 'Заголовок таблицы', quote: 'Цитата', lifehack: 'Лайфхак', aiHack: 'AI-лайфхак',
  instruction: 'Инструкция', riddle: 'Загадка', tale: 'Сказка', botLink: 'Ссылка на бота',
  farmStory: 'История фермы', promoText: 'Промо-текст', cardName: 'Карточка', cardText: 'Текст карточки',
  arUrl: 'AR ссылка', background: 'Фон (URL)', heroImage: 'Фото (URL)', portrait: 'Портрет (URL)',
  q: 'Вопрос', a: 'Ответ', kicker: 'Рубрика', icon: 'Иконка (эмодзи)', per100: 'на 100г', vs: 'vs',
  rank: '#', product: 'Продукт', mechanic: 'Механика', tags: 'Теги', items: 'Пункты',
  entries: 'Записи', interview: 'Интервью', steps: 'Шаги', table: 'Таблица', exercises: 'Упражнения',
};
const HIDDEN = new Set(['id', 'type', 'audience', 'origin']);
const LONG = new Set(['text', 'fact', 'advice', 'editorialNote', 'intro', 'chefVersion', 'homeVersion', 'lifehack', 'aiHack', 'instruction', 'riddle', 'tale', 'farmStory', 'promoText', 'cardText', 'quote', 'pullQuote', 'a']);
// Слоты-картинки: показываем кнопку загрузки фото (а не только вставку URL)
const IMAGE_KEYS = new Set(['background', 'heroImage', 'portrait']);

function lbl(k: string) { return LABELS[k] || k; }

const inputStyle: React.CSSProperties = { width: '100%' };

function ArrayEditor({ k, value, onChange }: { k: string; value: Record<string, any>[]; onChange: (v: any[]) => void }) {
  const keys = value.length ? Object.keys(value[0]) : [];
  const setItem = (idx: number, next: any) => { const c = value.slice(); c[idx] = next; onChange(c); };
  const add = () => { const shape = keys.reduce((o, kk) => ({ ...o, [kk]: '' }), {} as any); onChange([...value, shape]); };
  const remove = (idx: number) => onChange(value.filter((_, j) => j !== idx));
  return (
    <div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>{lbl(k)}</div>
      {value.map((row, idx) => (
        <div key={idx} style={{ display: 'grid', gap: '4px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          {Object.keys(row).map((sk) => (
            <input key={sk} className="input" placeholder={lbl(sk)} value={row[sk] ?? ''}
              onChange={(e) => setItem(idx, { ...row, [sk]: e.target.value })} />
          ))}
          <button type="button" onClick={() => remove(idx)} style={{ justifySelf: 'start', background: 'transparent', color: 'var(--error)', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>Удалить строку</button>
        </div>
      ))}
      <button type="button" onClick={add} style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>+ Добавить</button>
    </div>
  );
}

// Слот-картинка: URL-поле + загрузка файла через /api/upload + превью
function ImageField({ k, value, onChange }: { k: string; value: string; onChange: (v: string) => void }) {
  const [up, setUp] = useState(false);
  const upload = async (file: File) => {
    setUp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) onChange(data.url);
    } finally { setUp(false); }
  };
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{lbl(k)}</span>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input className="input" style={{ flex: 1 }} value={value} placeholder="URL или загрузите файл" onChange={(e) => onChange(e.target.value)} />
        <label style={{ cursor: 'pointer', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {up ? '… загрузка' : '📷 Загрузить'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {value && <img src={value} alt="" style={{ height: 34, width: 34, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />}
      </div>
    </label>
  );
}

function Field({ k, value, onChange }: { k: string; value: any; onChange: (v: any) => void }) {
  if (typeof value === 'string') {
    if (IMAGE_KEYS.has(k)) return <ImageField k={k} value={value} onChange={onChange} />;
    const long = LONG.has(k) || value.length > 60;
    return (
      <label style={{ display: 'block' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{lbl(k)}</span>
        {long
          ? <textarea className="input" style={inputStyle} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
          : <input className="input" style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />}
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <label style={{ display: 'block' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{lbl(k)}</span>
        <input className="input" type="number" style={inputStyle} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    );
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) {
      return (
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{lbl(k)} (через запятую)</span>
          <input className="input" style={inputStyle} value={value.join(', ')}
            onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
        </label>
      );
    }
    return <ArrayEditor k={k} value={value} onChange={onChange} />;
  }
  return null;
}

export function SlotEditor({ blocks, onChange, context }: { blocks: any[]; onChange: (b: any[]) => void; context?: AiContext }) {
  const [busy, setBusy] = useState<number | null>(null);
  const update = (idx: number, next: any) => { const copy = blocks.slice(); copy[idx] = next; onChange(copy); };

  const aiDraft = async (idx: number) => {
    setBusy(idx);
    try {
      const res = await adminFetch('/api/admin/magazine/ai-draft', {
        method: 'POST',
        body: JSON.stringify({ block: blocks[idx], context: context || {} }),
      });
      const data = await res.json();
      if (res.ok && data.block) update(idx, data.block);
      else alert(data.error || 'ИИ недоступен');
    } catch (e: any) {
      alert('Ошибка ИИ: ' + (e?.message || e));
    } finally { setBusy(null); }
  };

  if (!blocks.length) return <div style={{ color: 'var(--text-muted)' }}>Нет блоков.</div>;
  return (
    <div>
      {blocks.map((block, i) => (
        <details key={block.id || i} className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span>{SECTION_TITLES[block.type as keyof typeof SECTION_TITLES] || block.type}</span>
            <button type="button" disabled={busy !== null}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); aiDraft(i); }}
              title="Заполнить слоты текстом от ИИ (Gemini)"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 10px', cursor: busy !== null ? 'wait' : 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              {busy === i ? '⏳ Генерирую…' : '✨ ИИ'}
            </button>
          </summary>
          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {Object.keys(block).filter((k) => !HIDDEN.has(k)).map((k) => (
              <Field key={k} k={k} value={block[k]} onChange={(v) => update(i, { ...block, [k]: v })} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
