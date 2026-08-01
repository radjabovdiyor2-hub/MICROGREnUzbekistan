'use client';

import { HeaderSearch } from './HeaderSearch';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useCity } from '@/components/providers/CityProvider';
import { ShoppingCart, User, Moon, Sun, ArrowDown } from 'lucide-react';
import { LogoIcon } from '@/components/ui/Logo';
import { motion, AnimatePresence } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const cart = useCart();
  const { lang, toggleLang, t } = useLang();
  const { city, setCity } = useCity();
  const router = useRouter();
  const [searchVal, setSearchVal] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      router.push(`/catalog?search=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  const startVoiceSearch = () => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t('Овозли qidiruv qollab quvvatlanmaydi', 'Голосовой поиск не поддерживается вашим браузером.'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'uz' ? 'uz-UZ' : 'ru-RU';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript;
      setSearchVal(text);
      router.push(`/catalog?search=${encodeURIComponent(text.trim())}`);
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  return (
    <header className="header" id="main-header">
      <div className="header__inner">
        {/* Logo */}
        <Link href="/" className="header__logo" id="logo-link">
          <LogoIcon size={38} />
          <span className="header__logo-text">Microgreen Uzbekistan</span>
        </Link>

        {/* City Selector */}
        <div style={{ marginLeft: 16, position: 'relative' }}>
          <select 
            value={city} 
            onChange={(e) => setCity(e.target.value as 'tashkent' | 'samarkand')}
            style={{
              appearance: 'none',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: '6px 28px 6px 12px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="tashkent">Toshkent</option>
            <option value="samarkand">Samarqand</option>
            <option value="bukhara">Buxoro</option>
            <option value="fergana">Farg&apos;ona</option>
          </select>
          <ArrowDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
        </div>

      <HeaderSearch
          searchVal={searchVal}
          setSearchVal={setSearchVal}
          handleSearch={handleSearch}
          isListening={isListening}
          startVoiceSearch={startVoiceSearch}
          t={t}
        />
        {/* Desktop Navigation Links */}
        <nav className="header__nav" id="desktop-nav">
          <Link href="/catalog" className="header__nav-link">{t('nav.catalog')}</Link>
          <Link href="/recipe" className="header__nav-link">Рецепты</Link>
          <Link href="/magazine" className="header__nav-link">Журнал</Link>
          <Link href="/favorites" className="header__nav-link">{t('nav.favorites')}</Link>
        </nav>

        {/* Actions */}
        <div className="header__actions">
          {/* Language Toggle */}
          <motion.button
            className="theme-toggle"
            onClick={toggleLang}
            aria-label="Toggle language"
            id="lang-toggle"
            style={{ fontSize: '12px', fontWeight: 700, minWidth: 36 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            {lang === 'uz' ? 'RU' : 'UZ'}
          </motion.button>

          {/* Theme Toggle */}
          <motion.button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            id="theme-toggle"
            whileHover={{ rotate: 20, scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex' }}
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          {/* Cart */}
          <Link href="/cart" className="header__action-btn" id="cart-btn">
            <ShoppingCart size={22} />
            <AnimatePresence>
              {cart.totalItems > 0 && (
                <motion.span
                  className="header__cart-badge"
                  id="cart-count"
                  key={cart.totalItems}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={spring}
                >
                  {cart.totalItems > 99 ? '99+' : cart.totalItems}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          {/* Profile */}
          <Link href="/profile" className="header__action-btn" id="profile-btn">
            <User size={22} />
          </Link>
        </div>
      </div>
    </header>
  );
}
