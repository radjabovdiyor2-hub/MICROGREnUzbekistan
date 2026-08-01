'use client';

import { useState } from 'react';
import { DollarSign, Droplet, Leaf, Sun } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';

import { type CalcResult, inputStyle, CROP_DATA } from './quickCalcData';
export type { CalcResult };
export { inputStyle, CROP_DATA };

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
