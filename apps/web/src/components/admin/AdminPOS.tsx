'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminPOSReceipt } from './AdminPOSReceipt';
import { AdminPOSProducts } from './AdminPOSProducts';
import { AdminPOSCart } from './AdminPOSCart';
import type { ContractPrice, PosCustomer, Product } from './AdminPOSTypes';
import { usePosReceipt } from './usePosReceipt';
import { usePosCart } from './usePosCart';
import { usePosSubmit } from './usePosSubmit';
import { AdminPOSChrome } from './AdminPOSChrome';


export function AdminPOS({ sellerName, isOwner = false }: { sellerName?: string; isOwner?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const {
    cart, setCart, addToCart, updatePrice, setPriceReason, applyContract,
    updateQuantity, setQuantity, removeFromCart, total,
  } = usePosCart();

  const onPickCustomer = (picked: PosCustomer | null, prices: Map<string, ContractPrice>) => {
    setCustomer(picked);
    applyContract(prices);
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

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

  // Оформление чека вынесено в хук: вместе с уступкой, деловой датой и
  // автором продажи оно перестало помещаться в этот файл.
  const submit = usePosSubmit({
    cart,
    customerId: customer?.id ?? null,
    clearCart: () => setCart([]),
    sellerName: sellerName || 'Egasi',
    fmt,
    onDone: fetchProducts,
  });

  const { copied, isCapturing, handlePrint, handleCopyImage, handleShareImage } =
    usePosReceipt(submit.saleResult, fmt);

  // Sale/Return success screen with PREMIUM receipt
  if (submit.saleResult) {
    return (
      <AdminPOSReceipt
        saleResult={submit.saleResult}
        fmt={fmt}
        copied={copied}
        isCapturing={isCapturing}
        onPrint={handlePrint}
        onCopyImage={handleCopyImage}
        onShareImage={handleShareImage}
        onNewOperation={() => { submit.setSaleResult(null); setReturnMode(false); }}
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
        cartCount={cart.length}
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
          processing={submit.processing}
          paymentMethod={submit.paymentMethod}
          setPaymentMethod={submit.setPaymentMethod}
          returnReason={submit.returnReason}
          returnSaleNumber={submit.returnSaleNumber}
          setReturnSaleNumber={submit.setReturnSaleNumber}
          setReturnReason={submit.setReturnReason}
          debtInfo={submit.debtInfo}
          setDebtInfo={submit.setDebtInfo}
          editingPriceId={editingPriceId}
          setEditingPriceId={setEditingPriceId}
          editPriceValue={editPriceValue}
          setEditPriceValue={setEditPriceValue}
          updateQuantity={updateQuantity}
          setQuantity={setQuantity}
          updatePrice={updatePrice}
          setPriceReason={setPriceReason}
          isOwner={isOwner}
          discount={submit.discount}
          setDiscount={submit.setDiscount}
          saleDate={submit.saleDate}
          setSaleDate={submit.setSaleDate}
          seller={submit.seller}
          setSeller={submit.setSeller}
          customer={customer}
          onPickCustomer={onPickCustomer}
          removeFromCart={removeFromCart}
          processSale={submit.processSale}
          processReturn={submit.processReturn}
          total={total}
          fmt={fmt}
          inputStyle={inputStyle}
        />
      </div>
    </>
  );
}
