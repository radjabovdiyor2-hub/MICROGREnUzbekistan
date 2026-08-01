'use client';

import React, { useState } from 'react';
import { CheckCircle, Heart, Share2, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CalcResult } from './quickCalcData';

const spring = { type: 'spring' as const, damping: 24, stiffness: 280 };

export function ResultCard({ result, onSend }: { result: CalcResult; onSend: (text: string) => void }) {
  const [saved, setSaved] = useState(false);
  const text = `${result.title}\n\n${result.items.map(i => `${i.label}: ${i.value}`).join('\n')}${result.tip ? `\n\n${result.tip}` : ''}`;

  const share = async () => {
    const full = `${text}\n\nMicrogreen: +998 94 999 95 99\nmicrogreenuzbekistan.com`;
    if (navigator.share) {
      try { await navigator.share({ text: full, title: 'Microgreen Agro' }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(full); } catch { /* fallback */ }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    }
  };

  const save = () => {
    const history = JSON.parse(localStorage.getItem('Microgreen_calc_history') || '[]');
    history.unshift({ ...result, date: new Date().toISOString() });
    localStorage.setItem('Microgreen_calc_history', JSON.stringify(history.slice(0, 20)));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={result.title}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={spring}
        style={{
          background: 'var(--bg-card)', border: '1.5px solid var(--border)',
          borderRadius: 16, padding: 16,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} style={{ color: 'var(--success)' }} /> {result.title}
        </div>
        {result.items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', padding: '8px 0',
            borderBottom: i < result.items.length - 1 ? '1px solid var(--border)' : 'none',
            fontSize: 13,
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</span>
          </div>
        ))}
        {result.tip && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--brand-primary-light)', borderRadius: 8, fontSize: 12, color: 'var(--brand-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} /> {result.tip}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button onClick={() => onSend(`${text}\n\nMicrogreen katalogidan mos mahsulotlarni narxlari bilan tavsiya eting.`)}
            style={{ flex: 1, padding: 9, borderRadius: 10, background: 'var(--brand-primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Sparkles size={12} /> AI maslahat
          </button>
          <button onClick={save} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: saved ? 'var(--success)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {saved ? <><CheckCircle size={12} /> Saqlandi</> : <><Heart size={12} /> Saqlash</>}
          </button>
          <button onClick={share} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Share2 size={12} /> Ulashish
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
