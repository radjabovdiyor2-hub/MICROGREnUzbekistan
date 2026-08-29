'use client';

import { AdminSidebar } from './AdminSidebar';

import { AdminCommandPalette } from './AdminCommandPalette';

import { useState, useEffect, Suspense } from 'react';

import '@/styles/admin-shell.css';
import { AdminTabRouter } from './AdminTabRouter';
import { ALL_TABS, staffTabsFor } from './adminTabs';
import { AdminAuthScreens } from './AdminAuthScreens';
import { useAdminAuth, type StaffRole } from './useAdminAuth';
import { useAdminTab } from './useAdminTab';
import { AdminTelegramInit } from './AdminTelegramInit';
import { AdminFeedbackProvider } from '@/components/admin/AdminFeedback';
import { useRealtime } from '@/components/admin/useRealtime';

interface AdminShellProps {
  /** Роль из подписанной cookie, проверенной на сервере. null — не вошёл. */
  initialRole: StaffRole | null;
  initialName: string;
}

/** `useSearchParams` требует Suspense-границы — она здесь, а не внутри хука. */
export function AdminShell(props: AdminShellProps) {
  return (
    <Suspense fallback={null}>
      <AdminShellInner {...props} />
    </Suspense>
  );
}

function AdminShellInner({ initialRole, initialName }: AdminShellProps) {
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
    authMode, setAuthMode, isOwner, sellerName, staffRole, password, setPassword,
    pin, setPin, authError, setAuthError,
    handleOwnerLogin, handlePinPress, handleLogout, isAuthenticated,
  } = useAdminAuth(initialRole, initialName, t);

  // Вкладка живёт в адресной строке — ссылка из Telegram приводит на свой
  // экран (см. useAdminTab).
  const { activeTab, focus, query, openTab: setActiveTab } = useAdminTab();

  // Живой поток изменений. Одно подключение на всю админку, а не по одному
  // на экран: событие приходит темой, и кэш React Query устаревает сразу у
  // всех, кто эту тему читает. Экрану, который сейчас не открыт, запрос при
  // этом не уходит — у его запросов нет активных наблюдателей.
  const realtime = useRealtime(Boolean(isAuthenticated));

  const canSell = isOwner || staffRole === 'SELLER';
  const staffTabs = staffTabsFor();

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
      <>
      {/* Открыли кнопкой из Telegram — войдём без пароля (см. AdminTelegramInit). */}
      <AdminTelegramInit isAuthenticated={false} />
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
        lang={lang}
      />
      </>
    );
  }

  // === MAIN ADMIN PANEL ===
  return (
    // Тост и подтверждение — на всю админку. Родными окнами браузера
    // (`alert`/`confirm`) пользоваться нельзя: в Telegram Mini App они
    // выезжают системным листом поверх приложения и сбивают его хром.
    <AdminFeedbackProvider>
    <div className="admin-layout" style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <AdminTelegramInit isAuthenticated />

      <AdminSidebar
        realtime={realtime}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOwner={isOwner}
        staffTabs={staffTabs}
        sellerName={sellerName}
        lang={lang}
        toggleLang={toggleLang}
        handleLogout={handleLogout}
        setPaletteOpen={setPaletteOpen}
        setPaletteQuery={setPaletteQuery}
        t={t}
      />
      {/* Main Content */}
      <AdminTabRouter activeTab={activeTab} focus={focus} query={query} isOwner={isOwner} canSell={canSell} sellerName={sellerName} lang={lang} t={t} />

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
    </AdminFeedbackProvider>
  );
}
