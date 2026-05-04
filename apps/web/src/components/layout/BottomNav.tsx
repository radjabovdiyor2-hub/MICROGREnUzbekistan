'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';

export function BottomNav() {
  const pathname = usePathname();
  const cart = useCart();
  const { count: favCount } = useFavorites();
  const { t } = useLang();

  const NAV_ITEMS = [
    { href: '/', icon: <Icons.Home size={22} />, label: t('nav.home'), id: 'nav-home' },
    { href: '/catalog', icon: <Icons.Search size={22} />, label: t('nav.catalog'), id: 'nav-catalog' },
    { href: '/cart', icon: <Icons.ShoppingCart size={22} />, label: t('nav.cart'), id: 'nav-cart', badge: cart.totalItems },
    { href: '/favorites', icon: <Icons.Heart size={22} />, label: t('nav.favorites'), id: 'nav-favorites', badge: favCount },
    { href: '/profile', icon: <Icons.User size={22} />, label: t('nav.profile'), id: 'nav-profile' },
  ];

  // Better active check: exact for home, startsWith for others
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  };

  return (
    <nav className="bottom-nav" id="bottom-nav">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={true}
          className={`bottom-nav__item ${isActive(item.href) ? 'active' : ''}`}
          id={item.id}
        >
          <span className="bottom-nav__icon-wrap">
            {item.icon}
            {item.badge && item.badge > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -10,
                minWidth: 16, height: 16, borderRadius: 8,
                background: 'var(--error)', color: 'white',
                fontSize: '9px', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </span>
          <span className="bottom-nav__label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
