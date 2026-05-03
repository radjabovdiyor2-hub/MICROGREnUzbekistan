'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import * as Icons from '@/components/ui/Icons';
import { LogoIcon } from '@/components/ui/Logo';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const cart = useCart();
  const { lang, toggleLang, t } = useLang();
  const router = useRouter();
  const [searchVal, setSearchVal] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      router.push(`/catalog?search=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  return (
    <header className="header" id="main-header">
      <div className="header__inner">
        {/* Logo */}
        <Link href="/" className="header__logo" id="logo-link">
          <LogoIcon size={38} />
          <span className="header__logo-text">Microgreen Uzbekistan</span>
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="search-bar" id="search-bar">
          <span className="search-bar__icon"><Icons.Search size={18} /></span>
          <input
            type="text"
            className="search-bar__input"
            placeholder={t('search.placeholder')}
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            id="search-input"
          />
          <span className="search-bar__ai-badge">
            <Icons.Sparkles size={14} style={{ marginRight: '4px' }} /> AI
          </span>
        </form>

        {/* Actions */}
        <div className="header__actions">
          {/* Language Toggle */}
          <button
            className="theme-toggle"
            onClick={toggleLang}
            aria-label="Toggle language"
            id="lang-toggle"
            style={{ fontSize: '12px', fontWeight: 700, minWidth: 36 }}
          >
            {lang === 'uz' ? 'RU' : 'UZ'}
          </button>

          {/* Theme Toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            id="theme-toggle"
          >
            {theme === 'light' ? <Icons.Moon size={20} /> : <Icons.Sun size={20} />}
          </button>

          {/* Cart */}
          <Link href="/cart" className="header__action-btn" id="cart-btn">
            <Icons.ShoppingCart size={22} />
            {cart.totalItems > 0 && (
              <span className="header__cart-badge" id="cart-count">
                {cart.totalItems > 99 ? '99+' : cart.totalItems}
              </span>
            )}
          </Link>

          {/* Profile */}
          <Link href="/profile" className="header__action-btn" id="profile-btn">
            <Icons.User size={22} />
          </Link>
        </div>
      </div>
    </header>
  );
}
