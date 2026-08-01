'use client';

import { AdminSidebar } from './AdminSidebar';

import { AdminCommandPalette } from './AdminCommandPalette';

import { useState, useEffect } from 'react';

import '@/styles/admin-shell.css';
import { AdminTabRouter } from './AdminTabRouter';
import { ALL_TABS } from './adminTabs';
import { AdminAuthScreens } from './AdminAuthScreens';
import { useAdminAuth } from './useAdminAuth';

interface AdminShellProps {
  /** Роль из подписанной cookie, проверенной на сервере. null — не вошёл. */
  initialRole: 'ADMIN' | 'SELLER' | null;
  initialName: string;
}

export function AdminShell({ initialRole, initialName }: AdminShellProps) {
  const [activeTab, setActiveTab] = useState('pos');
  const [lang, setLang] = useState<'ru' | 'uz'>(() => {
    if (typeof window === 'undefined') return 'ru';
    const saved = sessionStorage.getItem('admin_lang');
    return saved === 'uz' || saved === 'ru' ? saved : 'ru';
  });

  // Палитра команд: вкладок стало больше тридцати, и листать боковое меню
  // ради одной — дольше, чем набрать пару букв.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const toggleLang = () => {
    const next = lang === 'ru' ? 'uz' : 'ru';
    setLang(next);
    sessionStorage.setItem('admin_lang', next);
  };
  const t = (ru: string, uz: string) => lang === 'ru' ? ru : uz;

  const {
    authMode, setAuthMode, isOwner, sellerName, password, setPassword,
    pin, setPin, authError, setAuthError,
    handleOwnerLogin, handlePinPress, handleLogout, isAuthenticated,
  } = useAdminAuth(initialRole, initialName, t);

  // Сессия уже проверена на сервере (см. admin/page.tsx) — читать её из
  // браузера незачем, поэтому и экрана ожидания «checking» больше нет.

  // Cmd+K / Ctrl+K открывает палитру, Esc закрывает.
  useEffect(() => {
    if (!isOwner) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
        setPaletteQuery('');
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOwner]);

  const paletteResults = paletteOpen
    ? ALL_TABS.filter(tab => {
        const q = paletteQuery.trim().toLowerCase();
        if (!q) return true;
        return tab.ru.toLowerCase().includes(q)
          || tab.uz.toLowerCase().includes(q)
          || tab.id.includes(q);
      }).slice(0, 12)
    : [];

  const openTab = (id: string) => {
    setActiveTab(id);
    setPaletteOpen(false);
    setPaletteQuery('');
  };


  // === AUTH SCREENS ===
  if (!isAuthenticated) {
    return (
      <AdminAuthScreens
        authMode={authMode}
        setAuthMode={setAuthMode}
        password={password}
        setPassword={setPassword}
        pin={pin}
        setPin={setPin}
        authError={authError}
        setAuthError={setAuthError}
        handleOwnerLogin={handleOwnerLogin}
        handlePinPress={handlePinPress}
        t={t}
      />
    );
  }

  // === MAIN ADMIN PANEL ===
  return (
    <div className="admin-layout" style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOwner={isOwner}
        sellerName={sellerName}
        lang={lang}
        toggleLang={toggleLang}
        handleLogout={handleLogout}
        setPaletteOpen={setPaletteOpen}
        setPaletteQuery={setPaletteQuery}
        t={t}
      />
      {/* Main Content */}
      <AdminTabRouter activeTab={activeTab} isOwner={isOwner} sellerName={sellerName} lang={lang} t={t} />

      <AdminCommandPalette
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        paletteQuery={paletteQuery}
        setPaletteQuery={setPaletteQuery}
        paletteResults={paletteResults}
        openTab={openTab}
        isOwner={isOwner}
        lang={lang}
        t={t}
      />
    </div>
  );
}
