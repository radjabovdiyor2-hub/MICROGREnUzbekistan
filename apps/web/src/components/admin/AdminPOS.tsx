'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Banknote, Camera, CheckCircle, Clock, Copy, CreditCard, Edit, FileText, MessageCircle, Minus, Plus, RefreshCw, Search, ShoppingCart, Trash,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { AdminPOSReceipt } from './AdminPOSReceipt';
import { AdminPOSProducts } from './AdminPOSProducts';
import { AdminPOSCart } from './AdminPOSCart';
import type { CartItem, DebtInfo, Product } from './AdminPOSTypes';


export function AdminPOS({ sellerName }: { sellerName?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'debt'>('cash');
  const [debtInfo, setDebtInfo] = useState<DebtInfo>({ personName: '', phone: '', dueDate: '' });
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<{ saleNumber: string; total: number; isReturn?: boolean; items?: CartItem[]; payMethod?: string; date?: string } | null>(null);
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
        setSaleResult({ saleNumber: data.saleNumber, total: data.total, items: [...cart], payMethod: paymentMethod, date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) });
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
        setSaleResult({ saleNumber: data.returnNumber, total: data.totalRefund, isReturn: true, items: [...cart], date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) });
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

  // Build receipt text for sharing
  const buildReceiptText = () => {
    if (!saleResult) return '';
    const lines = [
      `🧾 MICROGREEN UZBEKISTAN`,
      `${saleResult.isReturn ? 'Возврат' : 'Чек'} #${saleResult.saleNumber}`,
      `📅 ${saleResult.date || ''}`,
      `${'─'.repeat(28)}`,
    ];
    if (saleResult.items) {
      saleResult.items.forEach((item, i) => {
        lines.push(`${i+1}. ${item.product.nameUz}`);
        lines.push(`   ${item.quantity} x ${fmt(item.customPrice)} = ${fmt(item.customPrice * item.quantity)} сум`);
      });
    }
    lines.push(`${'─'.repeat(28)}`);
    lines.push(`💰 ${saleResult.isReturn ? 'Возврат' : 'ИТОГО'}: ${saleResult.isReturn ? '-' : ''}${fmt(saleResult.total)} сум`);
    if (saleResult.payMethod) {
      const methodNames: Record<string, string> = { cash: 'Наличные', card: 'Карта', debt: 'В долг' };
      lines.push(`💳 Оплата: ${methodNames[saleResult.payMethod] || saleResult.payMethod}`);
    }
    lines.push(`${'─'.repeat(28)}`);
    lines.push(`Спасибо за покупку!`);
    lines.push(`📞 +998 94 999 95 99`);
    return lines.join('\n');
  };

  const handlePrint = () => {
    const text = buildReceiptText();
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Чек #${saleResult?.saleNumber}</title><style>
      body { font-family: 'Courier New', monospace; font-size: 13px; padding: 16px; max-width: 350px; margin: 0 auto; }
      pre { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; }
      @media print { body { padding: 0; } }
    </style></head><body><pre>${text}</pre></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  const [copied, setCopied] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const captureReceiptImage = async (): Promise<Blob | null> => {
    const node = document.getElementById('receipt-node');
    if (!node) return null;
    setIsCapturing(true);
    try {
      const originalAnim = node.style.animation;
      const originalTransform = node.style.transform;
      node.style.animation = 'none';
      node.style.transform = 'none';
      
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: null });
      
      node.style.animation = originalAnim;
      node.style.transform = originalTransform;
      
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch (e) {
      console.error('Capture error', e);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const handleShareImage = async () => {
    const blob = await captureReceiptImage();
    if (!blob) return alert('Ошибка создания картинки');
    
    const file = new File([blob], `receipt_${saleResult?.saleNumber}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Чек #${saleResult?.saleNumber}`,
        });
      } catch (e) {
        console.error('Share cancelled or failed', e);
      }
    } else {
      // Fallback to copy if native share not supported
      handleCopyImage(blob);
    }
  };

  const handleCopyImage = async (preCapturedBlob?: Blob) => {
    const blob = preCapturedBlob || await captureReceiptImage();
    if (!blob) return alert('Ошибка создания картинки');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      alert('✅ Картинка чека скопирована! Вставьте (Ctrl+V) в Telegram или WhatsApp.');
    } catch (e) {
      console.error('Copy failed', e);
      alert('Ошибка копирования. Используйте Печать.');
    }
  };

  // Sale/Return success screen with PREMIUM receipt
  if (saleResult) {
    return (
      <AdminPOSReceipt
        saleResult={saleResult}
        fmt={fmt}
        copied={copied}
        isCapturing={isCapturing}
        onPrint={handlePrint}
        onCopyImage={handleCopyImage}
        onShareImage={handleShareImage}
        onNewOperation={() => { setSaleResult(null); setReturnMode(false); }}
      />
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
          <ShoppingCart size={18} /> Продажа
        </button>
        <button onClick={() => { setReturnMode(true); setCart([]); }}
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
          <Search size={16} /> Товары ({products.filter(p => selectedCategory === 'all' || p.category?.nameUz === selectedCategory).length})
        </button>
        <button onClick={() => setShowCart(true)}
          className={`btn ${showCart ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', position: 'relative', borderRadius: '12px', padding: '12px', fontSize: '14px', fontWeight: 700 }}>
          <ShoppingCart size={16} /> Чек
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
              <ShoppingCart size={20} />
              Чек ({cart.reduce((s, i) => s + i.quantity, 0)} шт)
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

      <div className="pos-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)',
        minHeight: 'calc(100vh - 200px)',
      }}>
        <AdminPOSProducts
          products={products}
          cart={cart}
          loading={loading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          addToCart={addToCart}
          fmt={fmt}
          inputStyle={inputStyle}
        />

        <AdminPOSCart
          cart={cart}
          returnMode={returnMode}
          processing={processing}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          returnReason={returnReason}
          setReturnReason={setReturnReason}
          debtInfo={debtInfo}
          setDebtInfo={setDebtInfo}
          editingPriceId={editingPriceId}
          setEditingPriceId={setEditingPriceId}
          editPriceValue={editPriceValue}
          setEditPriceValue={setEditPriceValue}
          updateQuantity={updateQuantity}
          updatePrice={updatePrice}
          removeFromCart={removeFromCart}
          processSale={processSale}
          processReturn={processReturn}
          total={total}
          fmt={fmt}
          inputStyle={inputStyle}
        />
      </div>
    </>
  );
}
