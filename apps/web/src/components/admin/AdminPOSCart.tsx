'use client';

import { Clock, RefreshCw, ShoppingCart } from 'lucide-react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { AdminPOSCartItems } from './AdminPOSCartItems';
import { AdminPOSSaleFooter } from './AdminPOSSaleFooter';
import { AdminPOSSaleOptions } from './AdminPOSSaleOptions';
import type { CartDiscount, CartItem, ContractPrice, DebtInfo, PosCustomer, SaleDate } from './AdminPOSTypes';

// Правая половина кассы: корзина, способ оплаты, долг и оформление.
// Вынесена из AdminPOS вместе с левой панелью.

interface Props {
  cart: CartItem[];
  returnMode: boolean;
  processing: boolean;
  paymentMethod: 'cash' | 'card' | 'debt';
  setPaymentMethod: Dispatch<SetStateAction<'cash' | 'card' | 'debt'>>;
  returnReason: string;
  returnSaleNumber: string;
  setReturnSaleNumber: (v: string) => void;
  setReturnReason: (v: string) => void;
  debtInfo: DebtInfo;
  setDebtInfo: Dispatch<SetStateAction<DebtInfo>>;
  editingPriceId: string | null;
  setEditingPriceId: (v: string | null) => void;
  editPriceValue: string;
  setEditPriceValue: (v: string) => void;
  /** Шаг вверх или вниз: направление, а не количество. */
  updateQuantity: (id: string, direction: number) => void;
  setQuantity: (id: string, value: number) => void;
  updatePrice: (id: string, newPrice: number) => void;
  setPriceReason: (id: string, reason: string) => void;
  isOwner: boolean;
  discount: CartDiscount | null;
  setDiscount: (v: CartDiscount | null) => void;
  saleDate: SaleDate | null;
  setSaleDate: (v: SaleDate | null) => void;
  seller: string;
  setSeller: (v: string) => void;
  customer: PosCustomer | null;
  onPickCustomer: (c: PosCustomer | null, prices: Map<string, ContractPrice>) => void;
  removeFromCart: (id: string) => void;
  processSale: () => void;
  processReturn: () => void;
  total: number;
  fmt: (n: number) => string;
  inputStyle: CSSProperties;
}

export function AdminPOSCart({
  cart, returnMode, processing, paymentMethod, setPaymentMethod,
  returnReason, setReturnReason, returnSaleNumber, setReturnSaleNumber, debtInfo, setDebtInfo,
  editingPriceId, setEditingPriceId, editPriceValue, setEditPriceValue,
  updateQuantity, setQuantity, updatePrice, setPriceReason, removeFromCart, processSale, processReturn,
  isOwner, discount, setDiscount, saleDate, setSaleDate, seller, setSeller,
  customer, onPickCustomer,
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
        }}>({cart.length} поз.)</span>}
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
          <AdminPOSCartItems
            cart={cart}
            editingPriceId={editingPriceId}
            setEditingPriceId={setEditingPriceId}
            editPriceValue={editPriceValue}
            setEditPriceValue={setEditPriceValue}
            updateQuantity={updateQuantity}
            setQuantity={setQuantity}
            updatePrice={updatePrice}
            setPriceReason={setPriceReason}
            removeFromCart={removeFromCart}
            fmt={fmt}
          />

          {returnMode ? (
            /* Return mode: reason + return button */
            <>
              {/* Номер чека обязателен: по нему сервер проверяет, что
                  возвращают не больше проданного и не второй раз. Раньше
                  возврат ничем не ограничивался. */}
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>Номер чека продажи:</div>
                <input type="text" placeholder="S-20260808-A1B2C3D4"
                  value={returnSaleNumber} onChange={e => setReturnSaleNumber(e.target.value)}
                  style={{ ...inputStyle, borderColor: 'var(--warning)' }} />
              </div>
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
            /* Sale mode: options + payment methods + total + submit */
            <>
            <AdminPOSSaleOptions
              isOwner={isOwner}
              discount={discount} setDiscount={setDiscount}
              saleDate={saleDate} setSaleDate={setSaleDate}
              seller={seller} setSeller={setSeller}
              customer={customer} onPickCustomer={onPickCustomer}
              inputStyle={inputStyle}
            />
            <AdminPOSSaleFooter
              processing={processing}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              debtInfo={debtInfo}
              setDebtInfo={setDebtInfo}
              processSale={processSale}
              total={total}
              fmt={fmt}
              inputStyle={inputStyle}
            />
            </>
          )}
        </>
      )}
    </div>
  );
}
