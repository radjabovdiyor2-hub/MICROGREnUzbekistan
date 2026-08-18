'use client';

import { AlertTriangle, RefreshCw, Search, ShoppingCart } from 'lucide-react';

// Обвязка кассы: переключатель «продажа / возврат», мобильные вкладки,
// плавающая кнопка корзины и адаптивные стили.
// Вынесено из AdminPOS: файл перерос 200 строк.

interface Props {
  returnMode: boolean;
  setReturnMode: (v: boolean) => void;
  clearCart: () => void;
  showCart: boolean;
  setShowCart: (v: boolean) => void;
  productCount: number;
  cartCount: number;
  total: number;
  fmt: (n: number) => string;
}

export function AdminPOSChrome({
  returnMode, setReturnMode, clearCart, showCart, setShowCart,
  productCount, cartCount, total, fmt,
}: Props) {
  return (
    <>
    {/* Sale / Return mode toggle */}
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      <button onClick={() => { setReturnMode(false); clearCart(); }}
        className={`btn btn-sm ${!returnMode ? 'btn-primary' : 'btn-ghost'}`}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', borderRadius: '12px', padding: '12px', fontSize: '15px', fontWeight: 700 }}>
        <ShoppingCart size={18} /> Продажа
      </button>
      <button onClick={() => { setReturnMode(true); clearCart(); }}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
          borderRadius: '12px', padding: '12px', fontSize: '15px', fontWeight: 700, border: 'none', cursor: 'pointer',
          background: returnMode ? 'var(--warning)' : 'var(--bg-tertiary)',
          color: returnMode ? 'var(--text-inverse)' : 'var(--text-secondary)',
          transition: 'all 0.2s',
        }}>
        <RefreshCw size={18} /> Возврат
      </button>
    </div>

    {returnMode && (
      <div style={{
        padding: '10px 16px', marginBottom: 'var(--space-3)', borderRadius: '12px',
        background: 'var(--warning-bg)', border: '1.5px solid var(--warning)', color: 'var(--warning)',
        display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--text-sm)', fontWeight: 600,
      }}>
        <AlertTriangle size={18} /> РЕЖИМ ВОЗВРАТА — выберите товар
      </div>
    )}
    {/* Mobile toggle: Products vs Cart */}
    <div className="pos-mobile-toggle" style={{ display: 'none', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      <button onClick={() => setShowCart(false)}
        className={`btn ${!showCart ? 'btn-primary' : 'btn-ghost'}`}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700 }}>
        <Search size={16} /> Товары ({productCount})
      </button>
      <button onClick={() => setShowCart(true)}
        className={`btn ${showCart ? 'btn-primary' : 'btn-ghost'}`}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', position: 'relative', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700 }}>
        <ShoppingCart size={16} /> Чек
        {cartCount > 0 && <span style={{
          position: 'absolute', top: -6, right: -6,
          padding: '2px 8px', minWidth: 22, height: 22,
          borderRadius: '12px', background: 'var(--error)', color: 'white',
          fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, border: '2px solid var(--bg-primary)',
        }}>{cartCount}</span>}
      </button>
    </div>

    {/* Floating cart button on mobile */}
    {cartCount > 0 && !showCart && (
      <div className="pos-mobile-fab" style={{ display: 'none' }}>
        <button onClick={() => setShowCart(true)}
          style={{
            position: 'fixed', bottom: 16, left: 12, right: 12, zIndex: 50,
            padding: '14px 20px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: 'var(--brand-primary)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: '15px', fontWeight: 700,
            boxShadow: '0 8px 32px rgba(var(--brand-primary-rgb), 0.4)',
          }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={20} />
            Чек ({cartCount} поз.)
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
            {fmt(total)} сум
          </span>
        </button>
      </div>
    )}

    <style>{`
      @media (max-width: 768px) {
        .pos-mobile-toggle { display: flex !important; }
        .pos-mobile-fab { display: block !important; }
        .pos-grid { grid-template-columns: 1fr !important; gap: 0 !important; overflow-x: hidden !important; max-width: 100% !important; }
        .pos-products { display: ${showCart ? 'none' : 'block'} !important; overflow-x: hidden !important; max-width: 100% !important; }
        .pos-cart { display: ${showCart ? 'flex' : 'none'} !important; }
        .pos-product-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 5px !important; max-height: calc(100vh - 380px) !important; overflow-x: hidden !important; }
        .pos-product-card { padding: 8px !important; gap: 4px !important; overflow: hidden !important; min-width: 0 !important; }
        .pos-product-thumb { width: 32px !important; height: 32px !important; border-radius: 8px !important; }
        .pos-product-name { font-size: 11px !important; white-space: normal !important; display: -webkit-box !important; -webkit-box-orient: vertical !important; -webkit-line-clamp: 2 !important; overflow: hidden !important; line-height: 1.3 !important; word-break: break-word !important; }
        .pos-product-price { font-size: 12px !important; }
        .pos-product-stock { font-size: 9px !important; padding: 1px 4px !important; }
        .pos-product-cat { font-size: 9px !important; display: none !important; }
        .pos-cat-pills { gap: 6px !important; margin-bottom: 10px !important; }
        .pos-cat-btn { padding: 8px 14px !important; font-size: 12px !important; border-radius: 12px !important; }
      }
      @media (max-width: 370px) {
        .pos-product-thumb { width: 28px !important; height: 28px !important; }
        .pos-product-name { font-size: 10px !important; }
        .pos-product-price { font-size: 11px !important; }
        .pos-cat-btn { padding: 6px 10px !important; font-size: 11px !important; }
      }
    `}</style>
    </>
  );
}
