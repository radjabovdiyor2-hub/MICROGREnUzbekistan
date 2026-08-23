'use client';

import { useState } from 'react';
import { AdminPOSReceipt } from './AdminPOSReceipt';
import { AdminPOSProducts } from './AdminPOSProducts';
import { AdminPOSCart } from './AdminPOSCart';
import { AdminPOSChrome } from './AdminPOSChrome';
import { PosQueueBanner } from './PosQueueBanner';
import { usePosReceipt } from './usePosReceipt';
import { usePosSession } from './usePosSession';

// Касса за прилавком. Механика — в usePosSession: прайс, корзина,
// покупатель и оформление чека общие с кассой на точке карты, а здесь
// осталась разметка.

export function AdminPOS({ sellerName, isOwner = false }: { sellerName?: string; isOwner?: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [returnMode, setReturnMode] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const s = usePosSession({ origin: 'counter', sellerName: sellerName || 'Egasi' });
  const submit = s.submit;

  const { copied, isCapturing, handlePrint, handleCopyImage, handleShareImage } =
    usePosReceipt(submit.saleResult, s.fmt);

  // Sale/Return success screen with PREMIUM receipt
  if (submit.saleResult) {
    return (
      <AdminPOSReceipt
        saleResult={submit.saleResult}
        fmt={s.fmt}
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
        returnMode={returnMode} setReturnMode={setReturnMode} clearCart={() => s.setCart([])}
        showCart={showCart} setShowCart={setShowCart}
        productCount={s.products.filter(p => selectedCategory === 'all' || p.category?.nameUz === selectedCategory).length}
        cartCount={s.cart.length}
        total={s.total} fmt={s.fmt} />

      {/* Отложенные чеки — над кассой, а не в тишине: продавец должен
          видеть их до того, как закроет смену. */}
      <PosQueueBanner queue={submit.queue} />

      {/* Раскладка — в классе `.pos-grid` (globals.css), а не здесь:
          инлайновый стиль перебивает медиазапросы, и на телефоне касса
          оставалась бы двумя колонками по 195 пикселей. */}
      <div className="pos-grid">
        <AdminPOSProducts
          products={s.products}
          cart={s.cart}
          loading={s.loading}
          searchQuery={s.searchQuery}
          setSearchQuery={s.setSearchQuery}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          addToCart={s.addToCart}
          fmt={s.fmt}
          inputStyle={inputStyle}
        />

        <AdminPOSCart
          cart={s.cart}
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
          updateQuantity={s.updateQuantity}
          setQuantity={s.setQuantity}
          updatePrice={s.updatePrice}
          setPriceReason={s.setPriceReason}
          isOwner={isOwner}
          discount={submit.discount}
          setDiscount={submit.setDiscount}
          saleDate={submit.saleDate}
          setSaleDate={submit.setSaleDate}
          seller={submit.seller}
          setSeller={submit.setSeller}
          customer={s.customer}
          onPickCustomer={s.pickCustomer}
          removeFromCart={s.removeFromCart}
          processSale={submit.processSale}
          processReturn={submit.processReturn}
          total={s.total}
          fmt={s.fmt}
          inputStyle={inputStyle}
        />
      </div>
    </>
  );
}
