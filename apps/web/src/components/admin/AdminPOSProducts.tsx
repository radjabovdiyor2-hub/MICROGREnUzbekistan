'use client';

import { Camera, Clock, Search } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatQty } from '@/lib/qty';
import type { CartItem, Product } from './AdminPOSTypes';

// Левая половина кассы: поиск, фильтр рубрик и сетка товаров.
// Вынесена из AdminPOS: панель самодостаточна, наружу от неё нужно
// только «добавить в корзину».

interface Props {
  products: Product[];
  cart: CartItem[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  addToCart: (p: Product) => void;
  fmt: (n: number) => string;
  inputStyle: CSSProperties;
}

export function AdminPOSProducts({
  products, cart, loading, searchQuery, setSearchQuery,
  selectedCategory, setSelectedCategory, addToCart, fmt, inputStyle,
}: Props) {
  return (
    <div className="pos-products">
      <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Поиск товара..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            ...inputStyle,
            paddingLeft: '42px', fontSize: 'var(--text-base)',
            borderRadius: '14px', height: '48px',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--brand-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-primary-rgb), 0.1)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
        />
      </div>

      {/* Category filter pills */}
      {(() => {
        const categories = Array.from(new Set(products.map(p => p.category?.nameUz).filter(Boolean))) as string[];
        return (
          <div className="pos-cat-pills" style={{
            display: 'flex', gap: '6px', marginBottom: 'var(--space-3)',
            overflowX: 'auto', paddingBottom: '4px',
            scrollbarWidth: 'none',
            position: 'sticky', top: 0, zIndex: 5,
            background: 'var(--bg-primary)',
          }}>
            <button className="pos-cat-btn" onClick={() => setSelectedCategory('all')}
              style={{
                padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.2s',
                background: selectedCategory === 'all' ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                color: selectedCategory === 'all' ? 'white' : 'var(--text-secondary)',
                boxShadow: selectedCategory === 'all' ? '0 2px 8px rgba(var(--brand-primary-rgb), 0.3)' : 'none',
              }}>
              Все ({products.length})
            </button>
            {categories.map(cat => {
              const count = products.filter(p => p.category?.nameUz === cat).length;
              return (
                <button key={cat} className="pos-cat-btn" onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.2s',
                    background: selectedCategory === cat ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                    color: selectedCategory === cat ? 'white' : 'var(--text-secondary)',
                    boxShadow: selectedCategory === cat ? '0 2px 8px rgba(var(--brand-primary-rgb), 0.3)' : 'none',
                  }}>
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        );
      })()}

      <div className="pos-product-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px',
        maxHeight: 'calc(100vh - 370px)', overflowY: 'auto',
        borderRadius: '14px', paddingRight: '2px', paddingBottom: cart.length > 0 ? '70px' : '0',
      }}>
        {loading ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
            <Clock size={28} style={{ animation: 'pulse 1.5s infinite' }} />
          </div>
        ) : products.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
            <Search size={36} style={{ marginBottom: 'var(--space-3)', opacity: 0.4 }} />
            <p style={{ fontSize: 'var(--text-sm)' }}>Товар не найден</p>
          </div>
        ) : (
          products
            .filter(p => selectedCategory === 'all' || p.category?.nameUz === selectedCategory)
            .map(product => {
            const inCart = cart.find(item => item.product.id === product.id);
            const outOfStock = product.stock <= 0;
            return (
              <div key={product.id} className="pos-product-card" onClick={() => !outOfStock && addToCart(product)}
                style={{
                  padding: '10px', cursor: outOfStock ? 'not-allowed' : 'pointer',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                  opacity: outOfStock ? 0.4 : 1,
                  transition: 'all 0.15s ease',
                  background: inCart ? 'var(--brand-primary-light)' : 'var(--bg-primary)',
                  borderRadius: '12px',
                  border: inCart ? '2px solid var(--brand-primary)' : '1.5px solid var(--border)',
                  position: 'relative',
                  boxShadow: inCart ? '0 2px 12px rgba(var(--brand-primary-rgb), 0.12)' : 'none',
                }}>
                {/* Cart quantity badge */}
                {inCart && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    minWidth: 24, height: 24, borderRadius: '8px',
                    background: 'var(--brand-primary)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 800, zIndex: 2,
                    border: '2px solid var(--bg-primary)',
                    boxShadow: '0 2px 6px rgba(var(--brand-primary-rgb), 0.3)',
                  }}>
                    {formatQty(inCart.quantity)}
                  </span>
                )}
                {/* Thumbnail row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="pos-product-thumb" style={{
                    width: 40, height: 40, borderRadius: '10px', overflow: 'hidden',
                    background: 'var(--bg-tertiary)', flexShrink: 0,
                    border: '1px solid var(--border)',
                  }}>
                    {product.images && product.images.length > 0 ? (
                      <img src={product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <Camera size={16} />
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pos-product-name" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {product.nameUz}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                      {product.category?.nameUz && (
                        <span className="pos-product-cat" style={{
                          padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                          background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                        }}>
                          {product.category.nameUz}
                        </span>
                      )}
                      <span className="pos-product-stock" style={{
                        padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                        background: outOfStock ? 'var(--error-bg)' : product.stock <= 5 ? 'var(--warning-bg)' : 'var(--success-bg)',
                        color: outOfStock ? 'var(--error)' : product.stock <= 5 ? 'var(--warning)' : 'var(--success)',
                      }}>
                        {product.stock}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Price */}
                <div className="pos-product-price" style={{ fontWeight: 800, color: 'var(--brand-primary)', fontSize: '14px', fontFamily: 'var(--font-display)', textAlign: 'right' }}>
                  {fmt(product.price)}
                  {product.unit && (
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      за {product.unit}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
