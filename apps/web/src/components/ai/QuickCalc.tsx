'use client';

import { useState } from 'react';
import { DollarSign, Droplet, Leaf, Sun } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';

const spring = { type: 'spring' as const, damping: 24, stiffness: 280 };

export interface CalcResult {
  title: string;
  items: { label: string; value: string }[];
  tip?: string;
}

export const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', width: '100%',
};

/* ==============================================
   ACCURATE MICROGREEN GROWING DATA
   Standard tray: 13 x 17 cm (0.0221 m2)
   Data source: practical microgreen farming
   ============================================== */

export const CROP_DATA: Record<string, {
  name: string;
  seedPerTray: number;  // grams per standard tray
  yieldPerTray: number; // grams harvest per tray
  darkDays: number;     // days under weight/dome
  lightDays: number;    // days under light
  totalDays: number;    // total grow cycle
  weightKg: number;     // press weight in kg
}> = {
  rukkola:     { name: 'Rukkola',         seedPerTray: 5,  yieldPerTray: 30,  darkDays: 2, lightDays: 5,  totalDays: 7,  weightKg: 2 },
  rediska:     { name: 'Rediska',         seedPerTray: 12, yieldPerTray: 80,  darkDays: 2, lightDays: 4,  totalDays: 6,  weightKg: 3 },
  kungaboqar:  { name: 'Kungaboqar',      seedPerTray: 25, yieldPerTray: 120, darkDays: 3, lightDays: 4,  totalDays: 7,  weightKg: 5 },
  nohat:       { name: "No'xat",          seedPerTray: 30, yieldPerTray: 100, darkDays: 2, lightDays: 3,  totalDays: 5,  weightKg: 3 },
  brokkoli:    { name: 'Brokkoli',        seedPerTray: 4,  yieldPerTray: 25,  darkDays: 2, lightDays: 5,  totalDays: 7,  weightKg: 2 },
  gorchitsa:   { name: "Gorchitsa (xantal)", seedPerTray: 5,  yieldPerTray: 35,  darkDays: 2, lightDays: 4,  totalDays: 6,  weightKg: 2 },
  mosh:        { name: 'Mosh (mung)',     seedPerTray: 25, yieldPerTray: 90,  darkDays: 2, lightDays: 3,  totalDays: 5,  weightKg: 3 },
  bazilika:    { name: 'Bazilika',        seedPerTray: 3,  yieldPerTray: 20,  darkDays: 3, lightDays: 7,  totalDays: 10, weightKg: 1.5 },
};

// ======== YIELD CALCULATOR ========
import {
  YieldCalc, LightCalc, WaterCalc, ProfitCalc, ResultCard, type CalcType,
} from './quickCalcForms';

export const CALC_TABS: { key: CalcType; labelUz: string; labelRu: string; icon: React.ReactNode; color: string }[] = [
  { key: 'yield', labelUz: 'Hosil', labelRu: 'Урожай', icon: <Leaf size={16} />, color: 'var(--brand-primary)' },
  { key: 'water', labelUz: 'Ozuqa', labelRu: 'Питание', icon: <Droplet size={16} />, color: 'var(--info)' },
  { key: 'light', labelUz: 'Yoritish', labelRu: 'Свет', icon: <Sun size={16} />, color: 'var(--warning)' },
  { key: 'profit', labelUz: "Biznes", labelRu: 'Бизнес', icon: <DollarSign size={16} />, color: 'var(--cat-2)' },
];

export function QuickCalcPanel({ onSendToChat }: { onSendToChat: (text: string) => void }) {
  const [activeCalc, setActiveCalc] = useState<CalcType>('yield');
  const [result, setResult] = useState<CalcResult | null>(null);
  const { t } = useLang();

  const handleResult = (r: CalcResult) => setResult(r);
  const handleSend = (text: string) => { onSendToChat(text); setResult(null); };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {CALC_TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveCalc(tab.key); setResult(null); }}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: activeCalc === tab.key ? `${tab.color}18` : 'var(--bg-card)',
              color: activeCalc === tab.key ? tab.color : 'var(--text-muted)',
              border: activeCalc === tab.key ? `1.5px solid ${tab.color}40` : '1.5px solid var(--border)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
            {tab.icon} {t(tab.labelUz, tab.labelRu)}
          </button>
        ))}
      </div>

      {/* Calculator */}
      {!result && activeCalc === 'yield' && <YieldCalc onResult={handleResult} />}
      {!result && activeCalc === 'light' && <LightCalc onResult={handleResult} />}
      {!result && activeCalc === 'water' && <WaterCalc onResult={handleResult} />}
      {!result && activeCalc === 'profit' && <ProfitCalc onResult={handleResult} />}

      {/* Result */}
      {result && <ResultCard result={result} onSend={handleSend} />}
    </div>
  );
}
