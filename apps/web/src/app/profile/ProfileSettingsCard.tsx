import React from 'react';
import { ArrowLeft, ChevronRight, MessageCircle, Moon, Phone, Settings, Sun } from 'lucide-react';

interface Props {
  theme: string;
  toggleTheme: () => void;
  lang: string;
  setLang: (lang: 'uz' | 'ru') => void;
  t: (uz: string, ru: string) => string;
  isLoggedIn: boolean;
  logout: () => void;
}

export function ProfileSettingsCard({ theme, toggleTheme, lang, setLang, t, isLoggedIn, logout }: Props) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} /> {t('Sozlamalar', 'Настройки')}
        </h3>
      </div>

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        style={{
          width: '100%', padding: 'var(--space-4)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
          background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)',
          border: 'none',
        }}
        id="profile-theme-toggle"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span>{theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}</span>
          <span>{t('Mavzu', 'Тема')}</span>
        </span>
        <span style={{
          padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
          background: 'var(--bg-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
        }}>
          {theme === 'light' ? t("Yorug'", 'Светлая') : t("Qorong'u", 'Тёмная')}
        </span>
      </button>

      {/* Language Toggle */}
      <button
        onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
        style={{
          width: '100%', padding: 'var(--space-4)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
          background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)',
          border: 'none',
        }}
        id="profile-lang-toggle"
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <MessageCircle size={18} />
          <span>{t('Til', 'Язык')}</span>
        </span>
        <span style={{
          padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)',
          background: lang === 'uz' ? 'var(--brand-primary-light)' : 'var(--brand-accent-light)',
          color: lang === 'uz' ? 'var(--brand-primary)' : 'var(--brand-accent)',
          fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
          transition: 'all var(--transition-fast)',
        }}>
          {lang === 'uz' ? "O'zbekcha" : 'Русский'}
        </span>
      </button>

      {/* Support */}
      <a href="tel:+998949999599" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-4)', borderBottom: isLoggedIn ? '1px solid var(--border)' : 'none',
        color: 'var(--text-primary)', textDecoration: 'none',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Phone size={18} />
          <span>{t('Aloqa', 'Контакты')}: +998 94 999 95 99</span>
        </span>
        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
      </a>

      {/* Logout */}
      {isLoggedIn && (
        <button
          onClick={logout}
          style={{
            width: '100%', padding: 'var(--space-4)', display: 'flex', alignItems: 'center',
            gap: 'var(--space-3)', background: 'transparent', cursor: 'pointer',
            color: 'var(--error)', border: 'none',
          }}
          id="logout-btn"
        >
          <ArrowLeft size={18} />
          <span>{t('Chiqish', 'Выйти')}</span>
        </button>
      )}
    </div>
  );
}
