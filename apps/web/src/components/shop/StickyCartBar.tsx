'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatPrice } from '@repo/shared';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { DELIVERY, freeDeliveryRemaining } from '@/lib/site';

// Global sticky checkout bar — appears whenever the cart has items, on every
// shopping page except the cart/checkout themselves. Shows the running total,
// a "free delivery" progress nudge (upsell), and a strong checkout CTA.
export function StickyCartBar() {
  const cart = useCart();
  const { t } = useLang();
  const pathname = usePathname() || '';

  const hiddenRoute =
    pathname.startsWith('/cart') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/admin');

  if (hiddenRoute || cart.totalItems === 0) return null;

  const remaining = freeDeliveryRemaining(cart.subtotal);
  const progress = Math.min(100, (cart.subtotal / DELIVERY.freeThreshold) * 100);
  const freeUnlocked = remaining === 0;

  return (
    <div className="sticky-cart-bar" id="sticky-cart-bar" role="region" aria-label={t('cart.title')}>
      {/* free-delivery progress / upsell nudge */}
      <div className="sticky-cart-bar__nudge">
        <div className="sticky-cart-bar__nudge-text">
          {freeUnlocked ? (
            <>
              <Icons.CheckCircle size={13} style={{ color: 'var(--success)' }} />
              {t('Bepul yetkazib berish ochildi!', 'Бесплатная доставка открыта!')}
            </>
          ) : (
            <>
              <Icons.Droplet size={13} style={{ color: 'var(--brand-accent)' }} />
              {t(
                `Bepul yetkazishgacha ${formatPrice(remaining)} so'm`,
                `До бесплатной доставки ${formatPrice(remaining)} сум`
              )}
            </>
          )}
        </div>
        <div className="sticky-cart-bar__track">
          <div className="sticky-cart-bar__fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* total + checkout CTA */}
      <div className="sticky-cart-bar__row">
        <div className="sticky-cart-bar__summary">
          <span className="sticky-cart-bar__count">
            {cart.totalItems} {t('cart.items_count')}
          </span>
          <span className="sticky-cart-bar__total">
            {formatPrice(cart.total)} {t('product.currency')}
          </span>
        </div>
        <Link href="/cart" className="btn btn-primary ripple sticky-cart-bar__cta" id="sticky-cart-checkout">
          <Icons.ShoppingCart size={17} />
          {t('cart.checkout')}
          <Icons.ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}
