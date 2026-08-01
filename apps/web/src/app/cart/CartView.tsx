'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  ArrowRight, ClipboardList, Folder, Lightbulb, Minus, Package, PartyPopper, CreditCard, Plus, ShoppingCart, Sparkles, Trash,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { LottieAnimation } from '@/components/ui/LottieAnimation';
import emptyStateData from '@/assets/lottie/empty-state.json';
import type { useCart, CartProduct } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { DELIVERY, freeDeliveryRemaining } from '@/lib/site';
import { trackBeginCheckout } from '@/lib/analytics';
import { CartItemList } from './CartItemList';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

const SmartSubscriptionWidget = dynamic(
  () => import('@/components/shop/SmartSubscriptionWidget').then(m => m.SmartSubscriptionWidget),
  { ssr: false },
);

// Экран корзины — первый из трёх шагов оформления. Рендерится ВМЕСТО формы
// и экрана успеха, то есть это самостоятельный режим страницы.

export interface RecoProduct {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  images: string[];
  category?: { nameUz: string; slug: string };
}

interface Props {
  cart: ReturnType<typeof useCart>;
  recos: RecoProduct[];
  recosLoading: boolean;
  fmt: (n: number) => string;
  setStep: (s: 'cart' | 'checkout' | 'success') => void;
}

export function CartView({ cart, recos, recosLoading, fmt, setStep }: Props) {
  const { t } = useLang();

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ShoppingCart size={28} /> {t('Savat', 'Корзина')}
      </h1>

      {cart.items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
          style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)', color: 'var(--text-muted)' }}
        >
          <LottieAnimation
            animationData={emptyStateData}
            loop
            style={{ width: 180, height: 180, margin: '0 auto var(--space-4)' }}
          />
          <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
            {t("Savat bo'sh", "Корзина пуста")}
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
            {t("Katalogdan mahsulotlarni qo'shing", "Добавьте товары из каталога")}
          </p>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Link href="/catalog" className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Folder size={20} /> {t("Katalogga o'tish", "Перейти в каталог")}
            </Link>
          </motion.div>
        </motion.div>
      ) : (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
          {/* Cart Items */}
          <CartItemList cart={cart} fmt={fmt} t={t} />

          {/* Order Summary Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <SmartSubscriptionWidget />
            <div className="card" style={{ padding: 'var(--space-6)', position: 'sticky', top: 'calc(var(--header-height) + var(--space-4))' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClipboardList size={20} /> {t("Buyurtma", "Заказ")}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                <span>{t("Mahsulotlar", "Товары")} ({cart.totalItems} {t("dona", "шт")})</span>
                <span>{fmt(cart.subtotal)} {t("so'm", "сум")}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                <span>{t("Yetkazish", "Доставка")}</span>
                <span style={{ color: cart.deliveryFee === 0 ? 'var(--success)' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {cart.deliveryFee === 0 ? <><PartyPopper size={14} /> {t("Bepul!", "Бесплатно!")}</> : `${fmt(cart.deliveryFee)} ${t("so'm", "сум")}`}
                </span>
              </div>
              {cart.deliveryFee > 0 && (
                <div style={{ padding: 'var(--space-3)', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--info)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'var(--font-medium)' }}>
                    <Lightbulb size={14} /> {t(`Yana ${fmt(freeDeliveryRemaining(cart.subtotal))} so'm — bepul yetkazish!`, `Еще ${fmt(freeDeliveryRemaining(cart.subtotal))} сум — бесплатная доставка!`)}
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      width: `${Math.min(100, (cart.subtotal / DELIVERY.freeThreshold) * 100)}%`,
                      background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))',
                      transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{t("Jami", "Итого")}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--brand-primary)' }}>
                  {fmt(cart.total)} {t("so'm", "сум")}
                </span>
              </div>
            </div>
            <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
              onClick={() => {
                trackBeginCheckout(cart.total, cart.items.map(i => ({ id: i.product.id, name: i.product.nameRu || i.product.nameUz, price: i.product.price, quantity: i.quantity })));
                setStep('checkout');
              }} id="go-checkout-btn">
              {t("Buyurtma berish", "Оформить заказ")} <ArrowRight size={18} />
            </button>
            <div style={{ textAlign: 'center', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CreditCard size={14} /> Click · Payme · {t("Naqd pul", "Наличные")}
            </div>
          </div>
        </div>
        </div>

        {/* "Yana qo'shing" recommendations — BELOW summary (better CTA flow) */}
        {(recosLoading || recos.filter((p) => !cart.items.find((i) => i.product.id === p.id)).length > 0) && (
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} style={{ color: 'var(--brand-accent)' }} />
              {t("Yana qo'shing", "Добавьте ещё")}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', overflowX: 'auto', paddingBottom: 'var(--space-1)' }}>
              {recosLoading
                ? [1, 2, 3, 4].map((i) => (
                    <div key={i} className="card" style={{ flexShrink: 0, width: 130, padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div className="skeleton" style={{ width: '100%', height: 76, borderRadius: 'var(--radius-sm)' }} />
                      <div className="skeleton" style={{ height: 11, width: '80%' }} />
                      <div className="skeleton" style={{ height: 11, width: '50%' }} />
                      <div className="skeleton" style={{ height: 28, width: '100%', borderRadius: 'var(--radius-sm)' }} />
                    </div>
                  ))
                : recos.filter((p) => !cart.items.find((i) => i.product.id === p.id)).map((p) => {
                    const fmt2 = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
                    return (
                      <div key={p.id} style={{ flexShrink: 0, width: 130, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', border: '1px solid var(--border)' }}>
                        <div style={{ width: '100%', height: 76, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.images && p.images.length > 0
                            ? <Image src={p.images[0]} alt={p.nameUz} width={130} height={76} style={{ width: '100%', height: '100%', objectFit: 'cover' }} quality={60} unoptimized={!p.images[0].startsWith('https://') && !p.images[0].startsWith('http://')} />
                            : <Package size={24} style={{ color: 'var(--text-muted)' }} />}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>
                          {t(p.nameUz, p.nameRu)}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
                          {fmt2(p.price)} {t("so'm", "сум")}
                        </div>
                        <button
                          className="btn btn-sm"
                          onClick={() => cart.addItem({ id: p.id, nameUz: p.nameUz, nameRu: p.nameRu, price: p.price, oldPrice: p.oldPrice, slug: p.slug, images: p.images, category: p.category } as CartProduct)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', border: 'none', color: 'var(--text-inverse)', background: 'var(--brand-primary)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-xs)' }}
                          id={`reco-add2-${p.id}`}
                        >
                          <Plus size={12} /> {t("Qo'shish", "Добавить")}
                        </button>
                      </div>
                    );
                  })}
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
