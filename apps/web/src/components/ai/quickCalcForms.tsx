'use client';

import { useState } from 'react';
import { CROP_DATA, inputStyle, type CalcResult } from './quickCalcData';


// Четыре калькулятора и карточка результата. Вынесены из QuickCalc —
// каждый самодостаточен и общается с панелью через onResult.

export function YieldCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
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
export function LightCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
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
export function WaterCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
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
export function ProfitCalc({ onResult }: { onResult: (r: CalcResult) => void }) {
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

export { ResultCard } from './QuickCalcResultCard';

// ======== MAIN EXPORT: QUICK CALC PANEL ========
export type CalcType = 'yield' | 'light' | 'water' | 'profit';
