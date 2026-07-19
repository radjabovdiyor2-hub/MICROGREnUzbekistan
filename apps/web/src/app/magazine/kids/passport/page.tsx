'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const HABITS = [
  { id: 'greens', label: 'Съел зелень', emoji: '🥗' },
  { id: 'newveg', label: 'Попробовал новый овощ', emoji: '🥦' },
  { id: 'water_plant', label: 'Полил росток', emoji: '💧' },
  { id: 'kitchen', label: 'Помог на кухне', emoji: '👩‍🍳' },
  { id: 'fruit', label: 'Съел фрукт', emoji: '🍎' },
  { id: 'water', label: 'Выпил воду', emoji: '🚰' },
];

const LEVELS = [
  { min: 0, name: 'Семечко', emoji: '🌰' },
  { min: 7, name: 'Росток', emoji: '🌱' },
  { min: 21, name: 'Садовник', emoji: '🪴' },
  { min: 50, name: 'Юный Агроном', emoji: '🧑‍🌾' },
];

const KEY = 'fw_passport_v1';
const today = () => new Date().toISOString().slice(0, 10);

interface Store { name: string; days: Record<string, string[]> }

function load(): Store {
  if (typeof window === 'undefined') return { name: '', days: {} };
  try { return { name: '', days: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { name: '', days: {} }; }
}

export default function PassportPage() {
  const [store, setStore] = useState<Store>({ name: '', days: {} });
  const [ready, setReady] = useState(false);

  useEffect(() => { setStore(load()); setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(store)); }, [store, ready]);

  const day = today();
  const todayChecks = store.days[day] || [];
  const total = Object.values(store.days).reduce((s, arr) => s + arr.length, 0);
  const level = [...LEVELS].reverse().find((l) => total >= l.min) || LEVELS[0];
  const streak = (() => {
    let n = 0; const d = new Date();
    while (true) { const k = d.toISOString().slice(0, 10); if ((store.days[k] || []).length > 0) { n++; d.setDate(d.getDate() - 1); } else break; }
    return n;
  })();

  const toggle = (id: string) => {
    setStore((s) => {
      const cur = s.days[day] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...s, days: { ...s.days, [day]: next } };
    });
  };

  if (!ready) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }} className="passport-print">
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }} className="no-print">← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🛂 Паспорт Юного Агронома</h1>

        <div style={{ background: 'var(--bg-elevated, #fff)', padding: 24, borderRadius: 24, border: '2px solid var(--brand-primary, #3a7a32)' }}>
          <input value={store.name} onChange={(e) => setStore((s) => ({ ...s, name: e.target.value }))} placeholder="Впиши своё имя"
            style={{ width: '100%', fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, border: 'none', borderBottom: '2px dashed var(--border, #ccc)', background: 'transparent', color: 'var(--text-primary)', padding: '6px 0', marginBottom: 16 }} />

          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: 20 }}>
            <div><div style={{ fontSize: 34 }}>{level.emoji}</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>{level.name}</div></div>
            <div><div style={{ fontSize: 34, fontWeight: 800, color: 'var(--brand-primary, #3a7a32)', fontFamily: "'Playfair Display', serif" }}>{total}</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>печатей</div></div>
            <div><div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'Playfair Display', serif", color: '#c9a84c' }}>🔥{streak}</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>дней подряд</div></div>
          </div>

          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted, #999)', marginBottom: 10 }}>Задания на сегодня</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {HABITS.map((h) => {
              const done = todayChecks.includes(h.id);
              return (
                <button key={h.id} onClick={() => toggle(h.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${done ? 'var(--brand-primary, #3a7a32)' : 'var(--border, #eee)'}`,
                  background: done ? 'rgba(58,122,50,0.12)' : 'transparent', textAlign: 'left',
                }}>
                  <span style={{ fontSize: 26 }}>{h.emoji}</span>
                  <span style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{h.label}</span>
                  <span style={{ fontSize: 22 }}>{done ? '✅' : '⭕'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }} className="no-print">
          <button onClick={() => window.print()} style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border, #ccc)', borderRadius: 30, padding: '10px 20px', fontFamily: "'Inter', sans-serif", fontWeight: 700, cursor: 'pointer' }}>🖨 Распечатать паспорт</button>
        </div>
      </div>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>
    </div>
  );
}
