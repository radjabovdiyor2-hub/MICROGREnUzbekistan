'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminPOSReceipt } from './AdminPOSReceipt';
import { AdminPOSProducts } from './AdminPOSProducts';
import { AdminPOSCart } from './AdminPOSCart';
import type { CartItem, DebtInfo, Product } from './AdminPOSTypes';
import { usePosReceipt } from './usePosReceipt';
import { usePosCart } from './usePosCart';
import { AdminPOSChrome } from './AdminPOSChrome';
import { submitSale, submitReturn, belowCostWarnings } from './posApi';


export function AdminPOS({ sellerName }: { sellerName?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'debt'>('cash');
  const [debtInfo, setDebtInfo] = useState<DebtInfo>({ personName: '', phone: '', dueDate: '' });
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<{ saleNumber: string; total: number; isReturn?: boolean; items?: CartItem[]; payMethod?: string; date?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  // Номер чека, из которого возвращают. Без него сервер отклонит возврат:
  // по нему проверяется, что возвращают не больше проданного и не повторно.
  const [returnSaleNumber, setReturnSaleNumber] = useState('');
  const { cart, setCart, addToCart, updatePrice, updateQuantity, removeFromCart, total } =
    usePosCart();

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

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const processSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'debt' && !debtInfo.personName) return;

    const warnings = belowCostWarnings(cart, fmt);
    if (warnings.length > 0 &&
        !confirm(`DIQQAT! Tan narxidan past sotilmoqda:\n\n${warnings.join('\n')}\n\nDavom etasizmi?`)) return;

    setProcessing(true);
    try {
      const data = await submitSale(cart, paymentMethod, sellerName || 'Egasi', debtInfo);
      if (data.success) {
        setSaleResult({ saleNumber: data.saleNumber!, total: data.total!, items: cart, payMethod: paymentMethod, date: new Date().toLocaleString('ru-RU') });
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
      const data = await submitReturn(cart, returnReason, sellerName || 'Egasi', returnSaleNumber.trim());
      if (data.success) {
        setSaleResult({ saleNumber: data.returnNumber!, total: data.totalRefund!, isReturn: true, items: cart, date: new Date().toLocaleString('ru-RU') });
        setCart([]);
        setReturnReason('');
        setReturnSaleNumber('');
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

  const { copied, isCapturing, handlePrint, handleCopyImage, handleShareImage } =
    usePosReceipt(saleResult, fmt);

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
      <AdminPOSChrome
        returnMode={returnMode} setReturnMode={setReturnMode} clearCart={() => setCart([])}
        showCart={showCart} setShowCart={setShowCart}
        productCount={products.filter(p => selectedCategory === 'all' || p.category?.nameUz === selectedCategory).length}
        cartCount={cart.length} cartQty={cart.reduce((s, i) => s + i.quantity, 0)}
        total={total} fmt={fmt} />


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
          returnSaleNumber={returnSaleNumber}
          setReturnSaleNumber={setReturnSaleNumber}
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
