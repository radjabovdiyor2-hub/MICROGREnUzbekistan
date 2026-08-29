'use client';

import { Banknote, MapPin, RotateCcw, User } from 'lucide-react';

import { paymentLabel, originLabel } from '@/lib/pos/labels';

import type { Sale } from './movementTypes';

// ══════════════════════════════════════════════════════════════════════
// Один чек в истории продаж: кто продал, кому и за что.
//
// ЧЕГО НЕ БЫЛО. Карточка чека показывала номер, время, число позиций и
// сумму. Ни покупателя, ни продавца — при том, что чек знает обоих с самого
// появления таблицы `pos_sales`. На вопрос «кто продал этот чек» история
// продаж не отвечала вовсе, а «кому продали» приходилось искать в CRM по
// времени.
//
// ПУСТОЕ ЗНАЧЕНИЕ НЕ РИСУЕМ. Продажа случайному человеку за прилавком — это
// норма, и строка «Покупатель: —» в каждом втором чеке приучает не читать
// весь блок. Нет покупателя — нет и строки.
//
// Возврат отличается цветом и знаком суммы, но устроен так же: у него тот
// же продавец, тот же покупатель и ссылка на исходный чек.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  sale: Sale;
  index: number;
  lang: 'ru' | 'uz';
  fmt: (n: number) => string;
  /** Возврат: минус к сумме и своя окраска. */
  isReturn?: boolean;
}

const text = {
  refundOf: { ru: 'возврат по чеку', uz: 'chek boʻyicha qaytarish' },
  backdated: { ru: 'задним числом', uz: 'orqaga sana' },
  discount: { ru: 'скидка', uz: 'chegirma' },
};

export function AdminSaleRow({ sale, index, lang, fmt, isReturn = false }: Props) {
  const tone = isReturn ? 'var(--warning)' : 'var(--success)';
  const pay = paymentLabel(sale.paymentMethod, lang);
  const origin = originLabel(sale.origin, lang);

  return (
    <div className="card" style={{ padding: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-md)',
              background: isReturn ? 'var(--warning-bg)' : 'var(--success-bg)',
              color: tone,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '11px',
              flexShrink: 0,
            }}
          >
            {isReturn ? <RotateCcw size={13} /> : index + 1}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'monospace' }}>
              {sale.number}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {new Date(sale.time).toLocaleTimeString('uz-UZ', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {sale.itemCount} ta tovar
            </div>
          </div>
        </div>
        <div style={{ fontWeight: 800, color: tone, fontSize: 'var(--text-sm)', flexShrink: 0 }}>
          {isReturn ? '−' : ''}
          {fmt(sale.total)} so&apos;m
        </div>
      </div>

      {/* Кто и кому — то, ради чего эта карточка и переписана. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {sale.customerName && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <User size={12} /> {sale.customerName}
          </span>
        )}
        {sale.performedBy && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
            <Banknote size={12} /> {sale.performedBy}
          </span>
        )}
        {pay && <span style={{ color: 'var(--text-muted)' }}>{pay}</span>}
        {origin && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-primary)' }}>
            <MapPin size={12} /> {origin}
          </span>
        )}
        {sale.discount > 0 && (
          <span style={{ color: 'var(--brand-accent)' }}>
            {text.discount[lang]} {fmt(sale.discount)}
            {sale.discountReason ? ` — ${sale.discountReason}` : ''}
          </span>
        )}
        {sale.backdated && (
          <span style={{ color: 'var(--warning)' }}>
            {text.backdated[lang]}
            {sale.backdateReason ? ` — ${sale.backdateReason}` : ''}
          </span>
        )}
        {sale.refundOf && (
          <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {text.refundOf[lang]} {sale.refundOf}
          </span>
        )}
        {isReturn && sale.reason && <span style={{ color: 'var(--text-muted)' }}>{sale.reason}</span>}
      </div>

      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2)',
        }}
      >
        {sale.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
              padding: '2px 0',
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              {Math.abs(item.quantity)}× {item.product.nameUz}
            </span>
            <span style={{ fontWeight: 600 }}>
              {fmt(Math.abs(item.quantity) * item.product.price)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
