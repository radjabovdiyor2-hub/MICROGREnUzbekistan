'use client';

import { Search } from 'lucide-react';

// Палитра команд (Cmd+K): поиск по вкладкам админки.
// Вынесена из AdminShell — открывается поверх панели и от неё не зависит.

interface PaletteTab {
  id: string;
  ru: string;
  uz: string;
  icon: React.ReactNode;
  group: { ru: string; uz: string };
  ownerOnly?: boolean;
}


interface Props {
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  paletteQuery: string;
  setPaletteQuery: (v: string) => void;
  paletteResults: PaletteTab[];
  openTab: (id: string) => void;
  isOwner: boolean;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
}

export function AdminCommandPalette({ paletteOpen, setPaletteOpen, paletteQuery, setPaletteQuery, paletteResults, openTab, isOwner, lang, t }: Props) {
  return (
    <>
{/* Палитра команд */}
{paletteOpen && isOwner && (
  <div
    onClick={() => setPaletteOpen(false)}
    style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '12vh', backdropFilter: 'blur(2px)',
    }}>
    <div
      onClick={e => e.stopPropagation()}
      style={{
        width: 'min(560px, 92vw)', background: 'var(--bg-primary)',
        border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          autoFocus
          value={paletteQuery}
          onChange={e => setPaletteQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && paletteResults[0]) openTab(paletteResults[0].id);
          }}
          placeholder={t('Куда перейти?', 'Qayerga o\'tish?')}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 'var(--text-base)',
          }}
        />
      </div>

      <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
        {paletteResults.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => openTab(tab.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: i === 0 ? 'var(--bg-secondary)' : 'transparent',
              color: 'var(--text-primary)', textAlign: 'left', fontSize: 'var(--text-sm)',
            }}>
            <span style={{ color: 'var(--brand-primary)', display: 'flex' }}>{tab.icon}</span>
            <span style={{ flex: 1 }}>{tab[lang]}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tab.group[lang]}</span>
          </button>
        ))}

        {!paletteResults.length && (
          <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {t('Ничего не найдено', 'Hech narsa topilmadi')}
          </div>
        )}
      </div>
    </div>
  </div>
)}
    </>
  );
}
