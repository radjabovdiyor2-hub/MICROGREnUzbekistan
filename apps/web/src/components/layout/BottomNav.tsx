'use client';

import { Home, Search, ShoppingCart, BookOpen, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/components/providers/CartProvider';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

export function BottomNav() {
  const pathname = usePathname();
  const cart = useCart();
  const { count: favCount } = useFavorites();
  const { t } = useLang();

  const NAV_ITEMS = [
    { href: '/', icon: Home, label: t('nav.home'), id: 'nav-home' },
    { href: '/catalog', icon: Search, label: t('nav.catalog'), id: 'nav-catalog' },
    { href: '/cart', icon: ShoppingCart, label: t('nav.cart'), id: 'nav-cart', badge: cart.totalItems },
    { href: '/magazine', icon: BookOpen, label: t('nav.magazine'), id: 'nav-magazine' },
    { href: '/profile', icon: User, label: t('nav.profile'), id: 'nav-profile' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  };

  return (
    <nav className="bottom-nav" id="bottom-nav">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={`bottom-nav__item ${active ? 'active' : ''}`}
            id={item.id}
          >
            <span className="bottom-nav__icon-wrap" style={{ position: 'relative' }}>
              <Icon size={22} />
              {item.badge && item.badge > 0 && (
                <motion.span
                  key={item.badge}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={spring}
                  style={{
                    position: 'absolute', top: -6, right: -10,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: 'var(--error)', color: 'white',
                    fontSize: '9px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                  }}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </motion.span>
              )}
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
