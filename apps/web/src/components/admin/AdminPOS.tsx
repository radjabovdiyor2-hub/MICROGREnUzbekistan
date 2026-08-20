'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminPOSReceipt } from './AdminPOSReceipt';
import { AdminPOSProducts } from './AdminPOSProducts';
import { AdminPOSCart } from './AdminPOSCart';
import type { ContractPrice, PosCustomer, Product } from './AdminPOSTypes';
import { usePosReceipt } from './usePosReceipt';
import { usePosCart } from './usePosCart';
import { usePosSubmit } from './usePosSubmit';
import { AdminPOSChrome } from './AdminPOSChrome';


export function AdminPOS({ sellerName, isOwner = false }: { sellerName?: string; isOwner?: boolean }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
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

  // Дебаунс — на ВВОД, а не на запрос. Прежний таймер стоял на самом
  // `fetchProducts`, поэтому касса ждала 300 мс даже при первом открытии,
  // когда искать ещё нечего.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Тот же ключ, что у экрана «Товары»: продажа и правка карточки
  // инвалидируют его одинаково, и касса подхватывает новую цену сразу.
  const { data: products = [], isPending: loading } = useQuery<Product[]>({
    queryKey: ['admin-products', 'pos', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('limit', '50');
      const res = await fetch(`/api/products?${params}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить товары');
      const data = await res.json();
      return (data.items || []) as Product[];
    },
  });

  // Оформление чека вынесено в хук: вместе с уступкой, деловой датой и
  // автором продажи оно перестало помещаться в этот файл.
  const submit = usePosSubmit({
    cart,
    customerId: customer?.id ?? null,
    clearCart: () => setCart([]),
    sellerName: sellerName || 'Egasi',
    fmt,
    // После чека остатки изменились — сбрасываем ВЕСЬ куст `admin-products`,
    // а не только список кассы: тот же товар открыт на «Товарах» и на складе.
    onDone: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
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
