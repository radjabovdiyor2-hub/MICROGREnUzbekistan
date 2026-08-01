'use client';

import Link from 'next/link';
import { Command, Home, LogOut, Settings, Tag } from 'lucide-react';
import { AdminNotifications } from '@/components/admin/AdminNotifications';
import { TAB_GROUPS, SELLER_TABS } from './adminTabs';

// Боковая панель админки: вкладки, переключатели языка и темы, выход.


interface Props {
  activeTab: string;
  setActiveTab: (id: string) => void;
  isOwner: boolean;
  sellerName: string;
  lang: 'ru' | 'uz';
  toggleLang: () => void;
  handleLogout: () => void;
  setPaletteOpen: (v: boolean) => void;
  setPaletteQuery: (v: string) => void;
  t: (ru: string, uz: string) => string;
}

export function AdminSidebar({ activeTab, setActiveTab, isOwner, sellerName, lang, toggleLang, handleLogout, setPaletteOpen, setPaletteQuery, t }: Props) {
  return (
    <>
{/* Sidebar / Topbar */}
<aside className="admin-sidebar">
  <div className="admin-header">
    <h1>
      {isOwner ? <><Settings size={24} color="var(--brand-primary)" /> Microgreen Admin</> : <><Tag size={24} color="var(--success)" /> {sellerName}</>}
    </h1>
    <div className="admin-header-actions">
      {!isOwner && (
        <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)' }}>
          {t('Продавец', 'Sotuvchi')}
        </span>
      )}
      {isOwner && <AdminNotifications />}
      {isOwner && (
        // Кнопка Face ID убрана: вход по WebAuthn отключён на сервере
        // (прежняя реализация не проверяла подпись), поэтому привязка
        // ключа ничего не давала. Вместо неё — палитра команд.
        <button onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }}
          title={t('Поиск по разделам (Ctrl+K)', "Bo'limlar bo'yicha qidiruv (Ctrl+K)")}
          style={{ padding: '4px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Command size={14} /> K
        </button>
      )}
      <button onClick={toggleLang}
        style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        {lang === 'ru' ? '🇷🇺' : '🇺🇿'}
      </button>
      <Link href="/" className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
        <Home size={14} /> {t('Сайт', 'Sayt')}
      </Link>
      <button onClick={handleLogout} className="btn btn-ghost btn-sm"
        style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.1)' }}>
        <LogOut size={14} /> {t('Выйти', 'Chiqish')}
      </button>
    </div>
  </div>

  <nav className="admin-tabs-container" style={{ padding: '0 var(--space-4)', overflowY: 'auto', flex: 1 }}>
    {isOwner ? (
      TAB_GROUPS.map((group, idx) => (
        <div key={idx} style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '8px' }}>
            {group.title[lang]}
          </div>
          <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {group.tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
                {tab.icon} {tab[lang]}
              </button>
            ))}
          </div>
        </div>
      ))
    ) : (
      <div className="admin-tabs-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {SELLER_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
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
