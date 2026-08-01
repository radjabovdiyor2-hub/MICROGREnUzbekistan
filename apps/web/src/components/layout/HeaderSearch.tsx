'use client';

import { motion } from 'framer-motion';
import { Mic, Search } from 'lucide-react';

// Строка поиска в шапке вместе с голосовым вводом.
// Вынесена из Header — самостоятельный кусок с собственным набором входов.

interface Props {
  searchVal: string;
  setSearchVal: (v: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  isListening: boolean;
  startVoiceSearch: () => void;
  t: (key: string) => string;
}

export function HeaderSearch({
  searchVal, setSearchVal, handleSearch, isListening, startVoiceSearch, t,
}: Props) {
  return (
    <>
  {/* Search Bar */}
  <form onSubmit={handleSearch} className="search-bar" id="search-bar">
    <span className="search-bar__icon"><Search size={18} /></span>
    <input
      type="text"
      className="search-bar__input"
      placeholder={t('search.placeholder')}
      value={searchVal}
      onChange={(e) => setSearchVal(e.target.value)}
      id="search-input"
    />
    
    {/* Voice Search Button — Framer Motion replaces dangerouslySetInnerHTML */}
    <motion.button 
      type="button" 
      onClick={startVoiceSearch}
      animate={isListening ? { scale: [1, 1.2, 1] } : { scale: 1 }}
      transition={isListening
        ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' }
        : { duration: 0.2 }}
      style={{ 
        background: 'none', border: 'none', cursor: 'pointer', 
        color: isListening ? 'var(--error)' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 8px',
      }}
    >
      <Mic size={18} />
    </motion.button>
  </form>

    </>
  );
}
