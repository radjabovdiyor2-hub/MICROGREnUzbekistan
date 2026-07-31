'use client';

import {
  Banknote, CheckCircle, Clock, Copy, CreditCard, FileText, MessageCircle, Plus, RefreshCw,
} from 'lucide-react';

// Экран успешной продажи/возврата — чек с кнопками «поделиться».
//
// Вынесен из AdminPOS проверкой 31.07.2026: файл кассы перевалил за тысячу
// строк, а этот блок к самой кассе отношения не имеет — он рисуется ПОСЛЕ
// операции и от корзины уже не зависит. Граница чистая: наружу нужны только
// результат операции, форматирование суммы и обработчики печати/копирования.

export interface SaleResultData {
  saleNumber: string;
  total: number;
  isReturn?: boolean;
  items?: { product: { nameUz: string }; quantity: number; customPrice: number }[];
  payMethod?: string;
  date?: string;
}

interface Props {
  saleResult: SaleResultData;
  fmt: (n: number) => string;
  copied: boolean;
  isCapturing: boolean;
  onPrint: () => void;
  onCopyImage: () => void;
  onShareImage: () => void;
  onNewOperation: () => void;
}

export function AdminPOSReceipt({
  saleResult,
  fmt,
  copied,
  isCapturing,
  onPrint,
  onCopyImage,
  onShareImage,
  onNewOperation,
}: Props) {
  const isReturn = saleResult.isReturn;
  const itemCount = saleResult.items?.reduce((s, i) => s + i.quantity, 0) || 0;
  const payLabel = saleResult.payMethod === 'cash' ? 'Наличные' : saleResult.payMethod === 'card' ? 'Карта' : 'В долг';
  const payIcon = saleResult.payMethod === 'cash' ? <Banknote size={14} /> : saleResult.payMethod === 'card' ? <CreditCard size={14} /> : <Clock size={14} />;

  return (
    <div style={{ animation: 'reveal-up 0.5s cubic-bezier(.4,0,.2,1) both' }}>
      <style>{`
        @keyframes receiptSlide { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes checkPop { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .receipt-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.12) !important; }
        .receipt-btn:active { transform: translateY(0); }
        .receipt-zigzag { position: relative; }
        .receipt-zigzag::after {
          content: ''; position: absolute; bottom: -8px; left: 0; right: 0; height: 8px;
          background: linear-gradient(135deg, var(--bg-primary) 25%, transparent 25%) -14px 0,
                      linear-gradient(225deg, var(--bg-primary) 25%, transparent 25%) -14px 0,
                      linear-gradient(315deg, var(--bg-primary) 25%, transparent 25%),
                      linear-gradient(45deg, var(--bg-primary) 25%, transparent 25%);
          background-size: 16px 8px;
          background-color: transparent;
        }
        .receipt-zigzag-top { position: relative; }
        .receipt-zigzag-top::before {
          content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px;
          background: linear-gradient(135deg, transparent 75%, var(--bg-primary) 75%),
                      linear-gradient(225deg, transparent 75%, var(--bg-primary) 75%),
                      linear-gradient(315deg, transparent 75%, var(--bg-primary) 75%) 14px 0,
                      linear-gradient(45deg, transparent 75%, var(--bg-primary) 75%) 14px 0;
          background-size: 16px 8px;
          background-color: transparent;
        }
      `}</style>

      {/* === RECEIPT CARD === */}
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
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -10, width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', animation: 'checkPop 0.6s cubic-bezier(.4,0,.2,1) 0.2s both',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
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

          {/* Dashed separator */}
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
                    {item.quantity} шт × {fmt(item.customPrice)}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px',
                  color: 'var(--text-primary)', flexShrink: 0, textAlign: 'right',
                }}>
                  {fmt(item.customPrice * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          {/* Dashed separator */}
          <div style={{ borderBottom: '2px dashed var(--border)', margin: '0 0 14px' }} />

          {/* Summary row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{itemCount} товар(ов)</span>
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

          {/* TOTAL — the hero */}
          <div style={{
            padding: '16px', borderRadius: '14px', marginTop: '8px',
            background: isReturn
              ? 'var(--warning-bg)'
              : 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.12))',
            border: isReturn ? '1.5px solid var(--warning)' : '1.5px solid rgba(16,185,129,0.2)',
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

        {/* Receipt footer with zigzag bottom */}
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

      {/* === ACTION BUTTONS === */}
      <div style={{ maxWidth: 380, margin: '16px auto 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* Print & Copy row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button className="receipt-btn" onClick={onPrint}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
              border: '1.5px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
              transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
            <FileText size={18} /> Печать
          </button>
          <button className="receipt-btn" onClick={() => onCopyImage()} disabled={isCapturing}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
              border: `1.5px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
              background: copied ? 'var(--success-bg)' : 'var(--bg-primary)',
              color: copied ? 'var(--success)' : 'var(--text-primary)',
              transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              opacity: isCapturing ? 0.7 : 1,
            }}>
            {copied ? <><CheckCircle size={18} /> Скопирован</> : isCapturing ? 'Копируем...' : <><Copy size={18} /> Копировать</>}
          </button>
        </div>

        {/* Social share row */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="receipt-btn" onClick={onShareImage} disabled={isCapturing}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
              background: 'linear-gradient(135deg, var(--info), var(--cat-5))', color: 'var(--text-inverse)',
              transition: 'all 0.2s ease', boxShadow: 'var(--shadow-md)',
              opacity: isCapturing ? 0.7 : 1,
            }}>
            <MessageCircle size={18} /> Отправить чек клиенту
          </button>
        </div>

        {/* New operation button */}
        <button className="receipt-btn" onClick={onNewOperation}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', padding: '16px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            fontWeight: 800, fontSize: '15px', letterSpacing: '-0.2px',
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
            color: 'white', transition: 'all 0.2s ease',
            boxShadow: '0 6px 24px rgba(var(--brand-primary-rgb), 0.35)',
          }}>
          <Plus size={20} /> Новая операция
        </button>
      </div>
    </div>
  );
}
