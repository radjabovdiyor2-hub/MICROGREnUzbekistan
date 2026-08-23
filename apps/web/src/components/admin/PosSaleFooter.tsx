'use client';

import { Banknote, Clock, CreditCard, RefreshCw, ShoppingCart } from 'lucide-react';

import type { DebtInfo } from './AdminPOSTypes';

// ══════════════════════════════════════════════════════════════════════
// Низ кассы на точке: способ оплаты, итог, кнопка «Продать».
//
// Вынесено из PosSaleSheet — вместе с оплатой и долгом лист переставал
// помещаться в 200 строк.
//
// Уступки и продажи задним числом здесь НЕТ намеренно. С выезда продают
// «сейчас и по договорной цене», а обе эти возможности требуют письменной
// причины — набирать её в чужом дворе одной рукой никто не станет.
// Понадобится — это делается за прилавком, где есть стол и клавиатура.
// ══════════════════════════════════════════════════════════════════════

const PAY = [
  { id: 'cash' as const, ru: 'Наличные', uz: 'Naqd', icon: <Banknote size={15} /> },
  { id: 'card' as const, ru: 'Карта', uz: 'Karta', icon: <CreditCard size={15} /> },
  { id: 'debt' as const, ru: 'В долг', uz: 'Qarzga', icon: <Clock size={15} /> },
];

const text = {
  total: { ru: 'Итого', uz: 'Jami' },
  sell: { ru: 'Продать', uz: 'Sotish' },
  empty: { ru: 'Добавьте товар', uz: 'Mahsulot qoʻshing' },
  due: { ru: 'Вернуть до (необязательно)', uz: 'Qaytarish sanasi' },
};

export function PosSaleFooter({
  lang, total, fmt, paymentMethod, setPaymentMethod, debtInfo, setDebtInfo,
  processing, onSell, disabled,
}: {
  lang: 'ru' | 'uz';
  total: number;
  fmt: (n: number) => string;
  paymentMethod: 'cash' | 'card' | 'debt';
  setPaymentMethod: (v: 'cash' | 'card' | 'debt') => void;
  debtInfo: DebtInfo;
  setDebtInfo: (v: DebtInfo) => void;
  processing: boolean;
  onSell: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {PAY.map((p) => (
          <button
            key={p.id}
            type="button"
            className={paymentMethod === p.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setPaymentMethod(p.id)}
            style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
          >
            {p.icon} {p[lang]}
          </button>
        ))}
      </div>

      {/* Долг: имя уже подставлено из карточки клиента — в поле остаётся
          только срок. Заставлять продавца печатать название ресторана,
          по которому он и открыл точку, незачем. */}
      {paymentMethod === 'debt' && (
        <input
          className="input"
          type="date"
          value={debtInfo.dueDate}
          onChange={(e) => setDebtInfo({ ...debtInfo, dueDate: e.target.value })}
          aria-label={text.due[lang]}
          style={{ minHeight: 44 }}
        />
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingTop: 'var(--space-2)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{text.total[lang]}</span>
        <strong style={{ fontSize: 'var(--text-xl)', fontFamily: 'var(--font-display)' }}>
          {fmt(total)}
        </strong>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={onSell}
        disabled={disabled || processing}
        style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        {processing ? <RefreshCw size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
        {disabled ? text.empty[lang] : `${text.sell[lang]} · ${fmt(total)}`}
      </button>
    </div>
  );
}
