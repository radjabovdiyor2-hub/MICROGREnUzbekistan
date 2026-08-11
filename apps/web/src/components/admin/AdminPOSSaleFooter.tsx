'use client';

import { Banknote, CheckCircle, Clock, CreditCard } from 'lucide-react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { DebtInfo } from './AdminPOSTypes';

// Нижняя часть кассы в режиме продажи: способ оплаты, карточка должника и
// итог с кнопкой подтверждения. Вынесена из AdminPOSCart — там осталась
// корзина и ветка возврата.

type PaymentMethod = 'cash' | 'card' | 'debt';

const METHODS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { key: 'cash', label: 'Нал', icon: <Banknote size={14} /> },
  { key: 'card', label: 'Карта', icon: <CreditCard size={14} /> },
  { key: 'debt', label: 'В долг', icon: <Clock size={14} /> },
];

interface Props {
  processing: boolean;
  paymentMethod: PaymentMethod;
  setPaymentMethod: Dispatch<SetStateAction<PaymentMethod>>;
  debtInfo: DebtInfo;
  setDebtInfo: Dispatch<SetStateAction<DebtInfo>>;
  processSale: () => void;
  total: number;
  fmt: (n: number) => string;
  inputStyle: CSSProperties;
}

export function AdminPOSSaleFooter({
  processing, paymentMethod, setPaymentMethod, debtInfo, setDebtInfo,
  processSale, total, fmt, inputStyle,
}: Props) {
  return (
    <>
      {/* Payment method */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>Способ оплаты:</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {METHODS.map(method => (
            <button key={method.key} onClick={() => setPaymentMethod(method.key)}
              className={`btn btn-sm ${paymentMethod === method.key ? 'btn-primary' : 'btn-outline'}`}
              style={{
                flex: 1, fontSize: 'var(--text-xs)', borderRadius: '10px',
                display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center',
              }}>
              {method.icon} {method.label}
            </button>
          ))}
        </div>
      </div>

      {/* Debt info */}
      {paymentMethod === 'debt' && (
        <div style={{
          marginBottom: 'var(--space-4)', padding: 'var(--space-4)',
          background: 'var(--bg-secondary)', borderRadius: '14px',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <input type="text" placeholder="Имя должника *" value={debtInfo.personName}
            onChange={e => setDebtInfo(prev => ({ ...prev, personName: e.target.value }))}
            style={inputStyle} />
          <input type="tel" placeholder="Телефон" value={debtInfo.phone}
            onChange={e => setDebtInfo(prev => ({ ...prev, phone: e.target.value }))}
            style={inputStyle} />
          <input type="date" value={debtInfo.dueDate}
            onChange={e => setDebtInfo(prev => ({ ...prev, dueDate: e.target.value }))}
            style={inputStyle} />
        </div>
      )}

      {/* Total + Submit */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Итого:</span>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
            fontSize: 'var(--text-2xl)', color: 'var(--brand-primary)',
            letterSpacing: '-0.5px',
          }}>
            {fmt(total)} сум
          </span>
        </div>
        <button onClick={processSale} disabled={processing || (paymentMethod === 'debt' && !debtInfo.personName)}
          className="btn btn-primary btn-lg btn-block"
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center',
            opacity: processing ? 0.6 : 1, borderRadius: '14px',
            fontSize: '1rem', fontWeight: 700, padding: '16px',
            boxShadow: '0 6px 20px rgba(var(--brand-primary-rgb), 0.3)',
          }}>
          {processing ? (
            <><Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Обработка...</>
          ) : (
            <><CheckCircle size={18} /> ПОДТВЕРДИТЬ</>
          )}
        </button>
      </div>
    </>
  );
}
