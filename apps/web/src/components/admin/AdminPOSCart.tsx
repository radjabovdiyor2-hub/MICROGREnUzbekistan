'use client';

import {
  Banknote, CheckCircle, Clock, CreditCard, Edit, Minus, Plus, RefreshCw, ShoppingCart, Trash,
} from 'lucide-react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { CartItem, DebtInfo } from './AdminPOSTypes';

// Правая половина кассы: корзина, способ оплаты, долг и оформление.
// Вынесена из AdminPOS вместе с левой панелью.

interface Props {
  cart: CartItem[];
  returnMode: boolean;
  processing: boolean;
  paymentMethod: 'cash' | 'card' | 'debt';
  setPaymentMethod: Dispatch<SetStateAction<'cash' | 'card' | 'debt'>>;
  returnReason: string;
  setReturnReason: (v: string) => void;
  debtInfo: DebtInfo;
  setDebtInfo: Dispatch<SetStateAction<DebtInfo>>;
  editingPriceId: string | null;
  setEditingPriceId: (v: string | null) => void;
  editPriceValue: string;
  setEditPriceValue: (v: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  updatePrice: (id: string, newPrice: number) => void;
  removeFromCart: (id: string) => void;
  processSale: () => void;
  processReturn: () => void;
  total: number;
  fmt: (n: number) => string;
  inputStyle: CSSProperties;
}

export function AdminPOSCart({
  cart, returnMode, processing, paymentMethod, setPaymentMethod,
  returnReason, setReturnReason, debtInfo, setDebtInfo,
  editingPriceId, setEditingPriceId, editPriceValue, setEditPriceValue,
  updateQuantity, updatePrice, removeFromCart, processSale, processReturn,
  total, fmt, inputStyle,
}: Props) {
  return (
    <div className="pos-cart card" style={{
      padding: 'var(--space-5)', display: 'flex', flexDirection: 'column',
      borderRadius: '20px',
    }}>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
        fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <ShoppingCart size={22} /> Чек
        {cart.length > 0 && <span style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          background: 'var(--bg-tertiary)', padding: '3px 10px',
          borderRadius: 'var(--radius-full)',
        }}>({cart.length} шт)</span>}
      </h3>

      {cart.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <div style={{ textAlign: 'center' }}>
            <ShoppingCart size={52} style={{ marginBottom: 'var(--space-3)', opacity: 0.2 }} />
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Выберите товар</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 'var(--space-4)' }}>
            {cart.map(item => {
              const priceChanged = item.customPrice !== item.product.price;
              const isEditing = editingPriceId === item.product.id;
              const belowCost = item.product.costPrice && item.customPrice < item.product.costPrice;
              return (
              <div key={item.product.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: '12px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {item.product.nameUz}
                    {belowCost && <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', background: 'color-mix(in srgb, var(--error) 15%, transparent)', color: 'var(--error)', fontWeight: 800 }}>УБЫТОК</span>}
                  </div>
                  {/* Editable price */}
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" value={editPriceValue}
                        onChange={e => setEditPriceValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const v = parseInt(editPriceValue);
                            if (v > 0) updatePrice(item.product.id, v);
                            setEditingPriceId(null);
                          } else if (e.key === 'Escape') setEditingPriceId(null);
                        }}
                        onBlur={() => {
                          const v = parseInt(editPriceValue);
                          if (v > 0) updatePrice(item.product.id, v);
                          setEditingPriceId(null);
                        }}
                        style={{ width: 90, padding: '4px 8px', border: '2px solid var(--brand-primary)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, outline: 'none' }}
                      />
                    </div>
                  ) : (
                    <div onClick={() => { setEditingPriceId(item.product.id); setEditPriceValue(String(item.customPrice)); }}
                      style={{ fontSize: 'var(--text-xs)', color: priceChanged ? 'var(--warning)' : 'var(--brand-primary)', fontWeight: 'var(--font-bold)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {fmt(item.customPrice * item.quantity)} сум
                      <Edit size={10} style={{ opacity: 0.5 }} />
                      {priceChanged && <span style={{ fontSize: '9px', color: 'var(--warning)', textDecoration: 'line-through', opacity: 0.6 }}>{fmt(item.product.price)}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => updateQuantity(item.product.id, -1)} className="btn btn-ghost btn-sm"
                    style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                    <Minus size={14} />
                  </button>
                  <span style={{ fontWeight: 'var(--font-bold)', minWidth: 24, textAlign: 'center', fontSize: '15px' }}>{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.product.id, 1)} className="btn btn-ghost btn-sm"
                    style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                    <Plus size={14} />
                  </button>
                </div>
                <button onClick={() => removeFromCart(item.product.id)} className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--error)', width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                  <Trash size={14} />
                </button>
              </div>
              );
            })}
          </div>

          {returnMode ? (
            /* Return mode: reason + return button */
            <>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>Причина возврата:</div>
                <input type="text" placeholder="Брак / Неверный товар / Другое..."
                  value={returnReason} onChange={e => setReturnReason(e.target.value)}
                  style={{ ...inputStyle, borderColor: 'var(--warning)' }} />
              </div>
              <div style={{ borderTop: '2px solid var(--warning)', paddingTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>Возврат:</span>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
                    fontSize: 'var(--text-2xl)', color: 'var(--warning)', letterSpacing: '-0.5px',
                  }}>
                    -{fmt(total)} сум
                  </span>
                </div>
                <button onClick={processReturn} disabled={processing}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center',
                    opacity: processing ? 0.6 : 1, borderRadius: '14px', border: 'none', cursor: 'pointer',
                    fontSize: '1rem', fontWeight: 700, padding: '16px', color: 'white',
                    background: 'var(--warning)', boxShadow: 'var(--shadow-accent)',
                  }}>
                  {processing ? (
                    <><Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Обработка...</>
                  ) : (
                    <><RefreshCw size={18} /> ВОЗВРАТ</>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Sale mode: payment methods + total + submit */
            <>
              {/* Payment method */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>Способ оплаты:</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {([
                    { key: 'cash' as const, label: 'Нал', icon: <Banknote size={14} /> },
                    { key: 'card' as const, label: 'Карта', icon: <CreditCard size={14} /> },
                    { key: 'debt' as const, label: 'В долг', icon: <Clock size={14} /> },
                  ]).map(method => (
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
          )}
        </>
      )}
    </div>
  );
}
