'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Icons from '@/components/ui/Icons';

interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  costPrice: number | null;
  stock: number;
  images: string[];
  category?: { nameUz: string };
}

interface CartItem {
  product: Product;
  quantity: number;
  customPrice: number; // editable sale price
}

interface DebtInfo {
  personName: string;
  phone: string;
  dueDate: string;
}

export function AdminPOS({ sellerName }: { sellerName?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'debt'>('cash');
  const [debtInfo, setDebtInfo] = useState<DebtInfo>({ personName: '', phone: '', dueDate: '' });
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<{ saleNumber: string; total: number; isReturn?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '50');
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data.items || []);
    } catch (err) {
      console.error('Products fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (!returnMode && existing.quantity >= product.stock) return prev;
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      if (!returnMode && product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1, customPrice: product.price }];
    });
  };

  const updatePrice = (productId: string, newPrice: number) => {
    if (newPrice <= 0) return;
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, customPrice: newPrice } : item
    ));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.product.stock) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const total = cart.reduce((sum, item) => sum + item.customPrice * item.quantity, 0);
  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const processSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'debt' && !debtInfo.personName) return;

    // Check for below-cost sales
    const belowCost = cart.filter(item => item.product.costPrice && item.customPrice < item.product.costPrice);
    if (belowCost.length > 0) {
      const warnings = belowCost.map(item =>
        `⚠️ ${item.product.nameUz}: ${fmt(item.customPrice)} < tan narxi ${fmt(item.product.costPrice!)} (zarar: -${fmt((item.product.costPrice! - item.customPrice) * item.quantity)})`
      ).join('\n');
      if (!confirm(`DIQQAT! Tan narxidan past sotilmoqda:\n\n${warnings}\n\nDavom etasizmi?`)) return;
    }

    setProcessing(true);
    try {
      const res = await fetch('/api/inventory/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.customPrice,
          })),
          paymentMethod,
          performedBy: sellerName || 'Egasi',
          debtInfo: paymentMethod === 'debt' ? debtInfo : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaleResult({ saleNumber: data.saleNumber, total: data.total });
        setCart([]);
        setPaymentMethod('cash');
        setDebtInfo({ personName: '', phone: '', dueDate: '' });
        fetchProducts();
      } else {
        alert(data.error || 'Xatolik yuz berdi');
      }
    } catch (err) {
      console.error('Sale error:', err);
      alert('Xatolik yuz berdi');
    } finally {
      setProcessing(false);
    }
  };

  const processReturn = async () => {
    if (cart.length === 0) return;

    setProcessing(true);
    try {
      const res = await fetch('/api/inventory/pos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            price: item.customPrice,
          })),
          reason: returnReason,
          performedBy: sellerName || 'Egasi',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaleResult({ saleNumber: data.returnNumber, total: data.totalRefund, isReturn: true });
        setCart([]);
        setReturnReason('');
        fetchProducts();
      } else {
        alert(data.error || 'Xatolik yuz berdi');
      }
    } catch (err) {
      console.error('Return error:', err);
      alert('Xatolik yuz berdi');
    } finally {
      setProcessing(false);
    }
  };
  const [showCart, setShowCart] = useState(false);

  // Sale/Return success screen
  if (saleResult) {
    const isReturn = saleResult.isReturn;
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', animation: 'reveal-up 0.4s ease both' }}>
        <div style={{
          width: 88, height: 88, borderRadius: 'var(--radius-full)',
          background: isReturn ? '#F59E0B18' : 'var(--success-bg)',
          color: isReturn ? '#D97706' : 'var(--success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--space-5)',
          boxShadow: isReturn ? '0 8px 24px rgba(245, 158, 11, 0.2)' : '0 8px 24px rgba(16, 185, 129, 0.2)',
        }}>
          {isReturn ? <Icons.RefreshCw size={44} /> : <Icons.CheckCircle size={44} />}
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
          fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)',
        }}>
          {isReturn ? 'Qaytarildi!' : 'Sotildi!'}
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
          {isReturn ? 'Qaytarish' : 'Chek'} #{saleResult.saleNumber}
        </p>
        <p style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
          fontSize: 'var(--text-xl)', color: isReturn ? '#D97706' : 'var(--brand-primary)',
          marginBottom: 'var(--space-6)',
        }}>
          {isReturn ? '-' : ''}{fmt(saleResult.total)} so&apos;m
        </p>
        <button onClick={() => { setSaleResult(null); setReturnMode(false); }} className="btn btn-primary btn-lg"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', borderRadius: '14px' }}>
          <Icons.Plus size={20} /> Yangi operatsiya
        </button>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)',
    borderRadius: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  return (
    <>
      {/* Sale / Return mode toggle */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button onClick={() => { setReturnMode(false); setCart([]); }}
          className={`btn btn-sm ${!returnMode ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', borderRadius: '12px', padding: '12px', fontSize: '15px', fontWeight: 700 }}>
          <Icons.ShoppingCart size={18} /> Sotish
        </button>
        <button onClick={() => { setReturnMode(true); setCart([]); }}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
            borderRadius: '12px', padding: '12px', fontSize: '15px', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: returnMode ? '#F59E0B' : 'var(--bg-tertiary)',
            color: returnMode ? 'white' : 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}>
          <Icons.RefreshCw size={18} /> Qaytarish
        </button>
      </div>

      {returnMode && (
        <div style={{
          padding: '10px 16px', marginBottom: 'var(--space-3)', borderRadius: '12px',
          background: '#FEF3C7', border: '1.5px solid #F59E0B', color: '#92400E',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--text-sm)', fontWeight: 600,
        }}>
          <Icons.AlertTriangle size={18} /> QAYTARISH REJIMI — tovarni tanlang
        </div>
      )}
      {/* Mobile toggle: Products vs Cart */}
      <div className="pos-mobile-toggle" style={{ display: 'none', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button onClick={() => setShowCart(false)}
          className={`btn ${!showCart ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700 }}>
          <Icons.Search size={16} /> Tovarlar ({products.filter(p => selectedCategory === 'all' || p.category?.nameUz === selectedCategory).length})
        </button>
        <button onClick={() => setShowCart(true)}
          className={`btn ${showCart ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', position: 'relative', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700 }}>
          <Icons.ShoppingCart size={16} /> Chek
          {cart.length > 0 && <span style={{
            position: 'absolute', top: -6, right: -6,
            padding: '2px 8px', minWidth: 22, height: 22,
            borderRadius: '12px', background: 'var(--error)', color: 'white',
            fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, border: '2px solid var(--bg-primary)',
          }}>{cart.length}</span>}
        </button>
      </div>

      {/* Floating cart button on mobile */}
      {cart.length > 0 && !showCart && (
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
              <Icons.ShoppingCart size={20} />
              Chek ({cart.reduce((s, i) => s + i.quantity, 0)} ta)
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
              {fmt(total)} so&apos;m
            </span>
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .pos-mobile-toggle { display: flex !important; }
          .pos-mobile-fab { display: block !important; }
          .pos-grid { grid-template-columns: 1fr !important; gap: 0 !important; }
          .pos-products { display: ${showCart ? 'none' : 'block'} !important; }
          .pos-cart { display: ${showCart ? 'flex' : 'none'} !important; }
          .pos-product-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 5px !important; max-height: calc(100vh - 380px) !important; }
          .pos-product-card { padding: 8px !important; gap: 4px !important; }
          .pos-product-thumb { width: 36px !important; height: 36px !important; border-radius: 8px !important; }
          .pos-product-name { font-size: 12px !important; white-space: normal !important; display: -webkit-box !important; -webkit-box-orient: vertical !important; -webkit-line-clamp: 2 !important; overflow: hidden !important; line-height: 1.3 !important; }
          .pos-product-price { font-size: 13px !important; }
          .pos-product-stock { font-size: 9px !important; padding: 1px 4px !important; }
          .pos-product-cat { font-size: 9px !important; }
          .pos-cat-pills { gap: 6px !important; margin-bottom: 10px !important; }
          .pos-cat-btn { padding: 10px 16px !important; font-size: 13px !important; border-radius: 12px !important; }
        }
        @media (max-width: 370px) {
          .pos-product-thumb { width: 30px !important; height: 30px !important; }
          .pos-product-name { font-size: 11px !important; }
          .pos-cat-btn { padding: 8px 12px !important; font-size: 12px !important; }
        }
      `}</style>

      <div className="pos-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)',
        minHeight: 'calc(100vh - 200px)',
      }}>
        {/* LEFT: Product search */}
        <div className="pos-products">
          <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
            <Icons.Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Tovar qidirish..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Izlash..."
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
                  Hammasi ({products.length})
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
                <Icons.Clock size={28} style={{ animation: 'pulse 1.5s infinite' }} />
              </div>
            ) : products.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                <Icons.Search size={36} style={{ marginBottom: 'var(--space-3)', opacity: 0.4 }} />
                <p style={{ fontSize: 'var(--text-sm)' }}>Tovar topilmadi</p>
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
                        {inCart.quantity}
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
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <Icons.Camera size={16} />
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
                            background: outOfStock ? '#EF444418' : product.stock <= 5 ? '#F59E0B18' : '#10B98118',
                            color: outOfStock ? '#EF4444' : product.stock <= 5 ? '#D97706' : '#059669',
                          }}>
                            {product.stock}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Price */}
                    <div className="pos-product-price" style={{ fontWeight: 800, color: 'var(--brand-primary)', fontSize: '14px', fontFamily: 'var(--font-display)', textAlign: 'right' }}>
                      {fmt(product.price)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Cart + checkout */}
        <div className="pos-cart card" style={{
          padding: 'var(--space-5)', display: 'flex', flexDirection: 'column',
          borderRadius: '20px',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
            fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <Icons.ShoppingCart size={22} /> Chek
            {cart.length > 0 && <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
              background: 'var(--bg-tertiary)', padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
            }}>({cart.length} ta)</span>}
          </h3>

          {cart.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ textAlign: 'center' }}>
                <Icons.ShoppingCart size={52} style={{ marginBottom: 'var(--space-3)', opacity: 0.2 }} />
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Tovarni tanlang</p>
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
                        {belowCost && <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', background: '#EF444420', color: '#EF4444', fontWeight: 800 }}>ZARAR</span>}
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
                          style={{ fontSize: 'var(--text-xs)', color: priceChanged ? '#D97706' : 'var(--brand-primary)', fontWeight: 'var(--font-bold)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {fmt(item.customPrice * item.quantity)} so&apos;m
                          <Icons.Edit size={10} style={{ opacity: 0.5 }} />
                          {priceChanged && <span style={{ fontSize: '9px', color: '#D97706', textDecoration: 'line-through', opacity: 0.6 }}>{fmt(item.product.price)}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button onClick={() => updateQuantity(item.product.id, -1)} className="btn btn-ghost btn-sm"
                        style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                        <Icons.Minus size={14} />
                      </button>
                      <span style={{ fontWeight: 'var(--font-bold)', minWidth: 24, textAlign: 'center', fontSize: '15px' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product.id, 1)} className="btn btn-ghost btn-sm"
                        style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                        <Icons.Plus size={14} />
                      </button>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--error)', width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                      <Icons.Trash size={14} />
                    </button>
                  </div>
                  );
                })}
              </div>

              {returnMode ? (
                /* Return mode: reason + return button */
                <>
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: '#92400E', marginBottom: 'var(--space-2)', fontWeight: 600 }}>Qaytarish sababi:</div>
                    <input type="text" placeholder="Nuqsonli / Noto'g'ri tovar / Boshqa..."
                      value={returnReason} onChange={e => setReturnReason(e.target.value)}
                      style={{ ...inputStyle, borderColor: '#F59E0B' }} />
                  </div>
                  <div style={{ borderTop: '2px solid #F59E0B', paddingTop: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: '#92400E' }}>Qaytarish:</span>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
                        fontSize: 'var(--text-2xl)', color: '#D97706', letterSpacing: '-0.5px',
                      }}>
                        -{fmt(total)} so&apos;m
                      </span>
                    </div>
                    <button onClick={processReturn} disabled={processing}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center',
                        opacity: processing ? 0.6 : 1, borderRadius: '14px', border: 'none', cursor: 'pointer',
                        fontSize: '1rem', fontWeight: 700, padding: '16px', color: 'white',
                        background: '#F59E0B', boxShadow: '0 6px 20px rgba(245, 158, 11, 0.3)',
                      }}>
                      {processing ? (
                        <><Icons.Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Kuting...</>
                      ) : (
                        <><Icons.RefreshCw size={18} /> QAYTARISH</>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                /* Sale mode: payment methods + total + submit */
                <>
                  {/* Payment method */}
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>To&apos;lov usuli:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {([
                        { key: 'cash' as const, label: 'Naqd', icon: <Icons.Banknote size={14} /> },
                        { key: 'card' as const, label: 'Karta', icon: <Icons.CreditCard size={14} /> },
                        { key: 'debt' as const, label: 'Qarzga', icon: <Icons.Clock size={14} /> },
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
                      <input type="text" placeholder="Qarzdor ismi *" value={debtInfo.personName}
                        onChange={e => setDebtInfo(prev => ({ ...prev, personName: e.target.value }))}
                        style={inputStyle} />
                      <input type="tel" placeholder="Telefon" value={debtInfo.phone}
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
                      <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Jami:</span>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
                        fontSize: 'var(--text-2xl)', color: 'var(--brand-primary)',
                        letterSpacing: '-0.5px',
                      }}>
                        {fmt(total)} so&apos;m
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
                        <><Icons.Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Kuting...</>
                      ) : (
                        <><Icons.CheckCircle size={18} /> TASDIQLASH</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
