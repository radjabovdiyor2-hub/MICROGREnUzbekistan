'use client';

import { Plus, Trash2 } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Что взять с собой в объезд.
//
// СПИСОК НЕОБЯЗАТЕЛЕН, и это не оговорка. Объезд бывает двух родов:
// развозной — когда в машину грузят лотки, и разведочный — когда едут
// знакомиться и договариваться. Второго не меньше, чем первого, и
// требовать список товаров у каждого плана значило бы заставлять
// придумывать его на пустом месте.
//
// КОЛИЧЕСТВО — ЭТО ЗАГРУЗКА МАШИНЫ, А НЕ ОТГРУЗКА КЛИЕНТУ. Сколько ушло
// каждому, знает чек кассы; здесь общий запас на день.
// ══════════════════════════════════════════════════════════════════════

export interface RouteGood {
  productId: string;
  qty: number;
}

export function AdminRouteGoods({ items, products, lang, onChange }: {
  items: RouteGood[];
  products: { id: string; nameRu: string; unit?: string | null }[];
  lang: 'ru' | 'uz';
  onChange: (items: RouteGood[]) => void;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const patch = (index: number, next: Partial<RouteGood>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...next } : item)));
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
        {t('Взять с собой', 'Oʻzi bilan olish')}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
          {' · '}
          {t('необязательно', 'majburiy emas')}
        </span>
      </div>

      {items.length === 0 && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {t('Без товаров — объезд для переговоров', 'Tovarsiz — muzokara uchun')}
        </div>
      )}

      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            value={item.productId}
            onChange={(e) => patch(index, { productId: e.target.value })}
          >
            <option value="">{t('— выберите товар —', '— tovar tanlang —')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.nameRu}</option>
            ))}
          </select>

          <input
            className="input"
            type="number"
            min={1}
            style={{ width: 90 }}
            value={item.qty}
            aria-label={t('Количество', 'Miqdor')}
            onChange={(e) => patch(index, { qty: Math.max(1, Number(e.target.value) || 1) })}
          />

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--error)' }}
            aria-label={t('Убрать товар', 'Tovarni olib tashlash')}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        style={{ justifySelf: 'start' }}
        onClick={() => onChange([...items, { productId: '', qty: 1 }])}
      >
        <Plus size={14} /> {t('Добавить товар', 'Tovar qoʻshish')}
      </button>
    </div>
  );
}
