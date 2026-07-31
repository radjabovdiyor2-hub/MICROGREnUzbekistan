'use client';

import { useState } from 'react';
import {
  CheckCircle, DollarSign, Droplet, Heart, Leaf, Share2, Sparkles, Sun, Zap,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion, AnimatePresence } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 24, stiffness: 280 };

interface CalcResult {
  title: string;
  items: { label: string; value: string }[];
  tip?: string;
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', width: '100%',
};

/* ==============================================
   ACCURATE MICROGREEN GROWING DATA
   Standard tray: 13 x 17 cm (0.0221 m2)
   Data source: practical microgreen farming
   ============================================== */

const CROP_DATA: Record<string, {
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
function YieldCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
  const [trays, setTrays] = useState('');
  const [cropType, setCropType] = useState('rukkola');
  const calc = () => {
    const t = parseInt(trays); if (!t || t < 1) return;
    const c = CROP_DATA[cropType];
    const totalSeed = t * c.seedPerTray;
    const totalYield = t * c.yieldPerTray;
    const substrate = (t * 0.5).toFixed(1);

    onResult({
      title: `${c.name} — ${t} lotok`,
      items: [
        { label: 'Kerakli urug\'', value: `${totalSeed} gr` },
        { label: 'Kutilayotgan hosil', value: `${totalYield} gr` },
        { label: 'Substrat (kokos/turf)', value: `${substrate} litr` },
        { label: 'Prijom (bosim)', value: `${c.weightKg} kg, ${c.darkDays} kun` },
        { label: 'Yorug\'lik bosqichi', value: `${c.lightDays} kun` },
        { label: 'Jami tsikl', value: `${c.totalDays} kun` },
      ],
      tip: `Urug'ni ekishdan oldin 4-8 soat suvda iviting. Prijom ${c.weightKg} kg — lotok ustiga qo'ying.`,
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={cropType} onChange={e => setCropType(e.target.value)} style={inputStyle}>
        {Object.entries(CROP_DATA).map(([key, val]) => (
          <option key={key} value={key}>{val.name}</option>
        ))}
      </select>
      <input type="number" min="1" placeholder="Lotoklar soni" value={trays} onChange={e => setTrays(e.target.value)} style={inputStyle} />
      <button onClick={calc} disabled={!trays} style={{ padding: 11, borderRadius: 10, background: 'var(--brand-primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: !trays ? 0.5 : 1 }}>
        Hisoblash
      </button>
    </div>
  );
}

// ======== LIGHT CALCULATOR ========
function LightCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
  const [area, setArea] = useState('');
  const [lightType, setLightType] = useState('led');
  const calc = () => {
    const a = parseFloat(area); if (!a) return;
    // Real data: LED fitolampa 40W/m2, Lyum 100W/m2
    const wPerM2 = lightType === 'led' ? 40 : 100;
    const power = Math.round(a * wPerM2);
    const hoursOn = 14; // standard for microgreens
    const dailyKwh = (power * hoursOn) / 1000;
    const monthlyKwh = dailyKwh * 30;
    const monthlyCost = Math.round(monthlyKwh * 450); // ~450 som/kWh in Uzbekistan

    onResult({
      title: `Yoritish — ${a} m\u00B2`,
      items: [
        { label: 'Lampa turi', value: lightType === 'led' ? 'LED Fitolampa' : 'Lyuminessent' },
        { label: 'Kerakli quvvat', value: `${power} Vt` },
        { label: 'Kunlik rejim', value: `${hoursOn} soat yorug' / ${24 - hoursOn} soat qorong'i` },
        { label: 'Kunlik sarfi', value: `${dailyKwh.toFixed(2)} kVt/soat` },
        { label: 'Oylik sarfi', value: `${monthlyKwh.toFixed(1)} kVt/soat` },
        { label: 'Oylik narxi (taxminan)', value: `${monthlyCost.toLocaleString()} so'm` },
      ],
      tip: 'LED fitolampa 15-20 sm balandlikda. Spektr: qizil 660nm + ko\'k 450nm.',
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="number" step="0.1" placeholder="Maydon (m\u00B2)" value={area} onChange={e => setArea(e.target.value)} style={inputStyle} />
      <select value={lightType} onChange={e => setLightType(e.target.value)} style={inputStyle}>
        <option value="led">LED Fitolampa (tejamkor)</option>
        <option value="lum">Lyuminessent (oddiy)</option>
      </select>
      <button onClick={calc} disabled={!area} style={{ padding: 11, borderRadius: 10, background: 'var(--warning)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: !area ? 0.5 : 1 }}>
        Hisoblash
      </button>
    </div>
  );
}

// ======== NUTRIENT SOLUTION CALCULATOR ========
function WaterCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
  const [volume, setVolume] = useState('');
  const [stage, setStage] = useState('veg');
  const calc = () => {
    const v = parseFloat(volume); if (!v) return;
    // Real nutrient dosage: ml per liter
    const doses: Record<string, { a: number; b: number; ec: string; ph: string; desc: string }> = {
      seedling: { a: 1.0, b: 1.0, ec: '0.4 - 0.8', ph: '5.8 - 6.2', desc: 'Maysa (1-3 kun)' },
      veg:      { a: 2.0, b: 2.0, ec: '1.0 - 1.6', ph: '5.5 - 6.0', desc: "O'sish (3-7 kun)" },
      bloom:    { a: 2.5, b: 2.5, ec: '1.6 - 2.2', ph: '5.5 - 6.0', desc: 'Hosil (7+ kun)' },
    };
    const d = doses[stage];

    onResult({
      title: `Ozuqa eritmasi — ${v} litr`,
      items: [
        { label: 'Bosqich', value: d.desc },
        { label: 'A komponent', value: `${(v * d.a).toFixed(1)} ml` },
        { label: 'B komponent', value: `${(v * d.b).toFixed(1)} ml` },
        { label: 'Maqsadli EC', value: d.ec },
        { label: 'Maqsadli pH', value: d.ph },
        { label: 'Suv harorati', value: '18-22\u00B0C' },
      ],
      tip: 'Avval A ni suvga qo\'shing, aralashtiring, keyin B ni. Hech qachon A va B ni to\'g\'ridan-to\'g\'ri aralashtirib bo\'lmaydi!',
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="number" step="0.5" placeholder="Suv hajmi (litr)" value={volume} onChange={e => setVolume(e.target.value)} style={inputStyle} />
      <select value={stage} onChange={e => setStage(e.target.value)} style={inputStyle}>
        <option value="seedling">Maysa bosqichi (1-3 kun)</option>
        <option value="veg">O&#39;sish bosqichi (3-7 kun)</option>
        <option value="bloom">Hosil bosqichi (7+ kun)</option>
      </select>
      <button onClick={calc} disabled={!volume} style={{ padding: 11, borderRadius: 10, background: 'var(--info)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: !volume ? 0.5 : 1 }}>
        Hisoblash
      </button>
    </div>
  );
}

// ======== PROFIT CALCULATOR ========
function ProfitCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
  const [trays, setTrays] = useState('');
  const [cropType, setCropType] = useState('kungaboqar');
  const [sellPrice, setSellPrice] = useState('25000');
  const calc = () => {
    const t = parseInt(trays); if (!t) return;
    const c = CROP_DATA[cropType];
    const p = parseFloat(sellPrice);
    // Cost per tray: seed ~1500, substrate ~500, water+light ~500, packaging ~500
    const seedCost = Math.round(c.seedPerTray * 60); // ~60 som per gram of seeds average
    const substrateCost = 500;
    const utilityCost = 500;
    const packagingCost = 500;
    const costPerTray = seedCost + substrateCost + utilityCost + packagingCost;
    const totalCost = t * costPerTray;
    const totalRevenue = t * p;
    const profit = totalRevenue - totalCost;
    const cyclesPerMonth = Math.floor(30 / c.totalDays);
    const monthlyProfit = profit * cyclesPerMonth;

    const fmt = (n: number) => n.toLocaleString('ru-RU');
    onResult({
      title: `Biznes-reja: ${c.name} x ${t} lotok`,
      items: [
        { label: 'Hosil (1 tsikl)', value: `${t * c.yieldPerTray} gr` },
        { label: `Xarajat (1 lotok)`, value: `${fmt(costPerTray)} so'm` },
        { label: 'Jami xarajat', value: `${fmt(totalCost)} so'm` },
        { label: 'Jami tushum', value: `${fmt(totalRevenue)} so'm` },
        { label: `Sof foyda (1 tsikl, ${c.totalDays} kun)`, value: `${fmt(profit)} so'm` },
        { label: `Oylik foyda (~${cyclesPerMonth} tsikl)`, value: `${fmt(monthlyProfit)} so'm` },
      ],
      tip: `ROI: ${((profit / totalCost) * 100).toFixed(0)}%. Doimiy B2B mijozlar (restoranlar) bilan ishlang!`,
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={cropType} onChange={e => setCropType(e.target.value)} style={inputStyle}>
        {Object.entries(CROP_DATA).map(([key, val]) => (
          <option key={key} value={key}>{val.name}</option>
        ))}
      </select>
      <input type="number" min="1" placeholder="Sotiladigan lotoklar soni" value={trays} onChange={e => setTrays(e.target.value)} style={inputStyle} />
      <input type="number" placeholder="1 lotok narxi (so'm)" value={sellPrice} onChange={e => setSellPrice(e.target.value)} style={inputStyle} />
      <button onClick={calc} disabled={!trays} style={{ padding: 11, borderRadius: 10, background: 'var(--brand-primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: !trays ? 0.5 : 1 }}>
        Hisoblash
      </button>
    </div>
  );
}

// ======== RESULT CARD ========
function ResultCard({ result, onSend }: { result: CalcResult; onSend: (text: string) => void }) {
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

// ======== MAIN EXPORT: QUICK CALC PANEL ========
export type CalcType = 'yield' | 'light' | 'water' | 'profit';

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
