'use client';

import React from 'react';
import { Banknote, CheckCircle, Clock, CreditCard, RefreshCw } from 'lucide-react';
import { formatQtyWithUnit, lineTotal } from '@/lib/qty';
import type { SaleResultData } from './posReceiptTypes';

export function AdminPOSReceiptCard({
  saleResult,
  fmt,
}: {
  saleResult: SaleResultData;
  fmt: (n: number) => string;
}) {
  const isReturn = saleResult.isReturn;
  // Позиции, а не сумма количеств: 2 лотка и 1 кг — это не «3 товара»,
  // и с дробными количествами такая сумма выглядела бы как «2.3 товар(ов)».
  const itemCount = saleResult.items?.length || 0;
  const payLabel = saleResult.payMethod === 'cash' ? 'Наличные' : saleResult.payMethod === 'card' ? 'Карта' : 'В долг';
  const payIcon = saleResult.payMethod === 'cash' ? <Banknote size={14} /> : saleResult.payMethod === 'card' ? <CreditCard size={14} /> : <Clock size={14} />;

  return (
    <div id="receipt-node" style={{
      maxWidth: 380, margin: '0 auto', animation: 'receiptSlide 0.6s cubic-bezier(.4,0,.2,1) both',
    }}>
      {/* Header with gradient */}
      <div className="receipt-zigzag" style={{
        background: isReturn
          ? 'linear-gradient(135deg, var(--warning), var(--brand-accent))'
          : 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
        padding: '28px 24px 32px', borderRadius: '20px 20px 0 0', textAlign: 'center', color: 'var(--text-inverse)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(var(--overlay-light-rgb), 0.1)' }} />
        <div style={{ position: 'absolute', bottom: -10, left: -10, width: 50, height: 50, borderRadius: '50%', background: 'rgba(var(--overlay-light-rgb), 0.08)' }} />

        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: 'rgba(var(--overlay-light-rgb), 0.2)',
          backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', animation: 'checkPop 0.6s cubic-bezier(.4,0,.2,1) 0.2s both',
          boxShadow: '0 8px 32px rgba(var(--overlay-dark-rgb), 0.15)',
        }}>
          {isReturn ? <RefreshCw size={32} /> : <CheckCircle size={32} />}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '20px', marginBottom: 4, letterSpacing: '-0.3px' }}>
          {isReturn ? 'Возврат оформлен' : 'Продажа завершена'}
        </div>
        <div style={{ opacity: 0.85, fontSize: '13px', fontWeight: 500 }}>
          #{saleResult.saleNumber} · {saleResult.date}
        </div>
      </div>

      {/* Receipt body */}
      <div className="receipt-zigzag-top" style={{
        background: 'var(--bg-primary)', padding: '24px 20px 20px',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
        position: 'relative',
      }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '3px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>
            MICROGREEN UZBEKISTAN
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6 }}>
            +998 94 999 95 99 · @microgreenuzbekistan
          </div>
        </div>

        <div style={{ borderBottom: '2px dashed var(--border)', margin: '0 0 14px' }} />

        {/* Items */}
        <div style={{ marginBottom: '14px' }}>
          {saleResult.items && saleResult.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '8px 0', animation: `fadeInUp 0.3s ease ${0.1 * i}s both`,
              borderBottom: i < (saleResult.items?.length || 0) - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '6px', flexShrink: 0,
                background: isReturn ? 'var(--warning-bg)' : 'var(--brand-primary-light)',
                color: isReturn ? 'var(--warning)' : 'var(--brand-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 800, marginTop: 1,
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '13px', lineHeight: 1.3, color: 'var(--text-primary)' }}>
                  {item.product.nameUz}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {formatQtyWithUnit(item.quantity, item.product.unit)} × {fmt(item.customPrice)}
                </div>
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px',
                color: 'var(--text-primary)', flexShrink: 0, textAlign: 'right',
              }}>
                {fmt(lineTotal(item.customPrice, item.quantity))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderBottom: '2px dashed var(--border)', margin: '0 0 14px' }} />

        {/* Summary row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{itemCount} позиц.</span>
          {saleResult.payMethod && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
              background: saleResult.payMethod === 'cash' ? 'var(--success-bg)' : saleResult.payMethod === 'card' ? 'var(--info-bg)' : 'var(--warning-bg)',
              color: saleResult.payMethod === 'cash' ? 'var(--success)' : saleResult.payMethod === 'card' ? 'var(--info)' : 'var(--warning)',
            }}>
              {payIcon} {payLabel}
            </span>
          )}
        </div>

        {/* TOTAL */}
        <div style={{
          padding: '16px', borderRadius: '14px', marginTop: '8px',
          background: isReturn
            ? 'var(--warning-bg)'
            : 'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.08), rgba(var(--brand-primary-hover-rgb), 0.12))',
          border: isReturn ? '1.5px solid var(--warning)' : '1.5px solid rgba(var(--brand-primary-rgb), 0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
              {isReturn ? 'Сумма возврата' : 'К оплате'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.7 }}>
              {saleResult.date}
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, letterSpacing: '-1px',
            fontSize: '26px', color: isReturn ? 'var(--warning)' : 'var(--brand-primary)',
          }}>
            {isReturn ? '−' : ''}{fmt(saleResult.total)}
            <span style={{ fontSize: '14px', fontWeight: 600, marginLeft: 4, letterSpacing: 0 }}>сум</span>
          </div>
        </div>
      </div>

      {/* Receipt footer */}
      <div style={{
        background: 'var(--bg-primary)', padding: '14px 20px 20px',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)', borderRadius: '0 0 20px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Спасибо за покупку! 🌱
          <br />
          <span style={{ opacity: 0.6 }}>microgreenuzbekistan.com</span>
        </div>
      </div>
    </div>
  );
}
