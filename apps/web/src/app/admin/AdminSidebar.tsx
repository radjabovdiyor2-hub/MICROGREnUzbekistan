'use client';

import Link from 'next/link';
import { ChevronRight, Command, Home, LogOut, Menu, Settings, Tag, X } from 'lucide-react';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { TAB_GROUPS } from './adminTabs';
import { useTabNavigation } from './useTabNavigation';
import { useState } from 'react';
import type { RealtimeState } from '@/components/admin/useRealtime';

// Боковая панель админки: вкладки, переключатели языка и темы, выход.

/** Подсказка к индикатору живого потока. */
const REALTIME_TITLE: Record<RealtimeState, string> = {
  live: 'Изменения приходят сразу — обновлять страницу не нужно',
  polling: 'Живой поток недоступен, данные обновляются раз в 30 секунд',
  connecting: 'Подключаемся к потоку изменений…',
};

interface Props {
  /** Состояние живого потока — видно в подвале панели. */
  realtime: RealtimeState;
  activeTab: string;
  setActiveTab: (id: string) => void;
  isOwner: boolean;
  sellerName: string;
  /** Вкладки сотрудника: касса, клиенты и свой рейс. */
  staffTabs: { id: string; ru: string; uz: string; icon: React.ReactNode }[];
  lang: 'ru' | 'uz';
  toggleLang: () => void;
  handleLogout: () => void;
  setPaletteOpen: (v: boolean) => void;
  setPaletteQuery: (v: string) => void;
  t: (ru: string, uz: string) => string;
}

export function AdminSidebar({ realtime, activeTab, setActiveTab, isOwner, sellerName, staffTabs, lang, toggleLang, handleLogout, setPaletteOpen, setPaletteQuery, t }: Props) {
  const nav = useTabNavigation(activeTab, isOwner);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Общий вид заголовка группы — и у «Часто», и у сворачиваемых.
  const GROUP_TITLE = {
    fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    marginBottom: '8px', paddingLeft: '8px',
  };

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Topbar */}
      <div className="admin-mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setIsMobileOpen(true)}>
          <Menu size={24} />
        </button>
        <div className="mobile-header-title">
          {isOwner ? <><Settings size={20} color="var(--brand-primary)" /> <span style={{fontWeight: 'var(--font-extrabold)', marginLeft: '4px'}}>Admin</span></> : <><Tag size={20} color="var(--success)" /> <span style={{fontWeight: 'var(--font-extrabold)', marginLeft: '4px'}}>{sellerName}</span></>}
        </div>
        <div className="mobile-header-actions-top">
          {isOwner && <AdminNotifications />}
          <button onClick={toggleLang}
            style={{ padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            {lang === 'ru' ? '🇷🇺' : '🇺🇿'}
          </button>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isMobileOpen && <div className="admin-sidebar-overlay" onClick={() => setIsMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${isMobileOpen ? 'open' : ''}`}>
        <div className="admin-header">
          <div className="admin-header-top-row">
            <h1>
              {isOwner ? <><Settings size={24} color="var(--brand-primary)" /> Microgreen Admin</> : <><Tag size={24} color="var(--success)" /> {sellerName}</>}
            </h1>
            <button className="mobile-close-btn" onClick={() => setIsMobileOpen(false)}>
              <X size={24} />
            </button>
          </div>
          <div className="admin-header-actions">
            {!isOwner && (
              <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)' }}>
                {t('Продавец', 'Sotuvchi')}
              </span>
            )}
            <div className="desktop-notifications">
              {isOwner && <AdminNotifications />}
            </div>
            {isOwner && (
              <button onClick={() => { setPaletteOpen(true); setPaletteQuery(''); setIsMobileOpen(false); }}
                title={t('Поиск по разделам (Ctrl+K)', "Bo'limlar bo'yicha qidiruv (Ctrl+K)")}
                style={{ padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Command size={14} /> K
              </button>
            )}
            <button onClick={toggleLang} className="desktop-lang-btn"
              style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              {lang === 'ru' ? '🇷🇺' : '🇺🇿'}
            </button>
            {/* Живой ли экран. Показываем не ради красоты: когда поток
                недоступен, данные обновляются раз в полминуты, и владельцу
                стоит об этом знать — иначе он решит, что касса не пробила
                продажу, хотя это экран ещё не доехал. */}
            <div title={REALTIME_TITLE[realtime]}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--text-muted)' }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: realtime === 'live' ? 'var(--success)' : realtime === 'polling' ? 'var(--warning)' : 'var(--text-muted)',
              }} />
              {realtime === 'live'
                ? t('Обновления вживую', 'Jonli yangilanish')
                : realtime === 'polling'
                  ? t('Обновление раз в 30 с', '30 soniyada bir')
                  : t('Подключение…', 'Ulanmoqda…')}
            </div>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <Link href="/" className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                <Home size={14} /> {t('Сайт', 'Sayt')}
              </Link>
              <button onClick={handleLogout} className="btn btn-ghost btn-sm"
                style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(var(--error-rgb), 0.1)', flex: 1, justifyContent: 'center' }}>
                <LogOut size={14} /> {t('Выйти', 'Chiqish')}
              </button>
            </div>
          </div>
        </div>

        <nav className="admin-tabs-container" style={{ padding: '0 var(--space-4)', overflowY: 'auto', flex: 1 }}>
          {isOwner ? (
            <>
              {/* «Часто» — дневной круг владельца. Пятьдесят вкладок в
                  двенадцати группах листались целиком ради тех пяти, куда
                  он заходит каждый день. */}
              {nav.recentTabs.length > 1 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={GROUP_TITLE}>{lang === 'ru' ? 'Часто' : 'Tez-tez'}</div>
                  <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {nav.recentTabs.map(tab => (
                      <button key={`recent-${tab.id}`} onClick={() => handleTabClick(tab.id)}
                        className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
                        {tab.icon} {tab[lang]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {TAB_GROUPS.map((group, idx) => {
                const open = nav.isGroupOpen(group.title.ru);
                return (
                  <div key={idx} style={{ marginBottom: open ? 'var(--space-4)' : 'var(--space-1)' }}>
                    {/* Заголовок стал кнопкой: группа сворачивается и
                        запоминает это. Группа с открытой вкладкой раскрыта
                        всегда — иначе активный экран прятался бы сам. */}
                    <button type="button" onClick={() => nav.toggleGroup(group.title.ru)}
                      aria-expanded={open}
                      style={{ ...GROUP_TITLE, display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', cursor: 'pointer', minHeight: 32, textAlign: 'left' }}>
                      <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                      <span style={{ flex: 1 }}>{group.title[lang]}</span>
                      {!open && <span style={{ opacity: 0.6 }}>{nav.groupSize(group.title.ru)}</span>}
                    </button>
                    {open && (
                      <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {group.tabs.map(tab => (
                          <button key={tab.id} onClick={() => handleTabClick(tab.id)}
                            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
                            {tab.icon} {tab[lang]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {staffTabs.map(tab => (
                <button key={tab.id} onClick={() => handleTabClick(tab.id)}
                  className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
                  {tab.icon} {tab[lang]}
                </button>
              ))}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
