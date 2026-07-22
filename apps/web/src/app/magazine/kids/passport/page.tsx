'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   Паспорт Юного Агронома — FRESH WEEKLY
   Хранение: localStorage (без регистрации)
   Механика: печати за активности, уровни, streak, сертификат
   ───────────────────────────────────────────── */

interface Stamp {
  id: string;
  label: string;
  emoji: string;
  category: 'daily' | 'game' | 'ar';
}

const STAMPS: Stamp[] = [
  // Ежедневные привычки
  { id: 'greens', label: 'Съел зелень', emoji: '🥗', category: 'daily' },
  { id: 'newveg', label: 'Попробовал новый овощ', emoji: '🥦', category: 'daily' },
  { id: 'water_plant', label: 'Полил росток', emoji: '💧', category: 'daily' },
  { id: 'kitchen', label: 'Помог на кухне', emoji: '👩‍🍳', category: 'daily' },
  { id: 'fruit', label: 'Съел фрукт', emoji: '🍎', category: 'daily' },
  { id: 'water', label: 'Выпил воду', emoji: '🚰', category: 'daily' },
  // Игровые достижения
  { id: 'riddle3', label: 'Решил 3 загадки', emoji: '🔊', category: 'game' },
  { id: 'tale', label: 'Послушал нейро-сказку', emoji: '📖', category: 'game' },
  { id: 'food_art', label: 'Сделал фуд-арт', emoji: '🎨', category: 'game' },
  { id: 'plant_quest', label: 'Вырастил урожай', emoji: '🌱', category: 'game' },
  { id: 'ar_coloring', label: 'Раскрасил Агро Друга', emoji: '🖌️', category: 'game' },
  // AR-достижения
  { id: 'ar_scan', label: 'Отсканировал карточку', emoji: '📸', category: 'ar' },
  { id: 'ar_collect3', label: 'Собрал 3 персонажа', emoji: '🌟', category: 'ar' },
  { id: 'ar_all', label: 'Собрал всех Агро Друзей', emoji: '🏆', category: 'ar' },
];

const LEVELS = [
  { min: 0, name: 'Семечко', emoji: '🌰', color: '#a8a29e' },
  { min: 7, name: 'Росток', emoji: '🌱', color: '#4ade80' },
  { min: 21, name: 'Садовник', emoji: '🪴', color: '#22c55e' },
  { min: 50, name: 'Юный Агроном', emoji: '🧑‍🌾', color: '#f59e0b' },
  { min: 100, name: 'Мастер Агроферми', emoji: '👑', color: '#ef4444' },
];

const KEY = 'fw_passport_v2';
const today = () => new Date().toISOString().slice(0, 10);

interface Store {
  name: string;
  avatar: string;
  days: Record<string, string[]>;
  achievements: string[];
  createdAt: string;
}

function load(): Store {
  if (typeof window === 'undefined') return { name: '', avatar: '🌱', days: {}, achievements: [], createdAt: today() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { name: '', avatar: '🌱', days: {}, achievements: [], createdAt: today(), ...parsed };
    }
    // Миграция с v1
    const v1 = localStorage.getItem('fw_passport_v1');
    if (v1) {
      const old = JSON.parse(v1);
      return { name: old.name || '', avatar: '🌱', days: old.days || {}, achievements: [], createdAt: today() };
    }
  } catch { /* пустой паспорт */ }
  return { name: '', avatar: '🌱', days: {}, achievements: [], createdAt: today() };
}

const AVATARS = ['🌱', '🍅', '🥦', '🍓', '🤖', '🍃', '🚜', '🌻', '🌿', '🍀'];

const CATEGORY_LABELS: Record<Stamp['category'], string> = {
  daily: 'Ежедневные привычки',
  game: 'Игровые достижения',
  ar: 'AR-коллекция',
};

export default function PassportPage() {
  const [store, setStore] = useState<Store>({ name: '', avatar: '🌱', days: {}, achievements: [], createdAt: today() });
  const [ready, setReady] = useState(false);
  const [showAvatars, setShowAvatars] = useState(false);
  const [celebrateStamp, setCelebrateStamp] = useState<string | null>(null);

  useEffect(() => { setStore(load()); setReady(true); }, []);
  useEffect(() => {
    if (ready) {
      localStorage.setItem(KEY, JSON.stringify(store));
      // Также обновляем v1 для обратной совместимости
      localStorage.setItem('fw_passport_v1', JSON.stringify({ name: store.name, days: store.days }));
    }
  }, [store, ready]);

  // Автоматическая проверка AR-достижений
  useEffect(() => {
    if (!ready) return;
    try {
      const arCollected = JSON.parse(localStorage.getItem('fw_ar_collected') || '[]');
      const count = Array.isArray(arCollected) ? arCollected.length : 0;
      const newAchievements = [...store.achievements];
      if (count >= 1 && !newAchievements.includes('ar_scan')) newAchievements.push('ar_scan');
      if (count >= 3 && !newAchievements.includes('ar_collect3')) newAchievements.push('ar_collect3');
      if (count >= 6 && !newAchievements.includes('ar_all')) newAchievements.push('ar_all');
      if (newAchievements.length > store.achievements.length) {
        setStore(s => ({ ...s, achievements: newAchievements }));
      }
    } catch { /* ok */ }
  }, [ready, store.achievements]);

  const day = today();
  const todayChecks = store.days[day] || [];
  const totalDaily = Object.values(store.days).reduce((s, arr) => s + arr.length, 0);
  const totalStamps = totalDaily + store.achievements.length;
  const level = [...LEVELS].reverse().find(l => totalStamps >= l.min) || LEVELS[0];
  const nextLevel = LEVELS.find(l => l.min > totalStamps);

  const streak = (() => {
    let n = 0;
    const d = new Date();
    while (true) {
      const k = d.toISOString().slice(0, 10);
      if ((store.days[k] || []).length > 0) { n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  })();

  const toggle = (id: string) => {
    const cur = store.days[day] || [];
    const wasChecked = cur.includes(id);
    const next = wasChecked ? cur.filter(x => x !== id) : [...cur, id];
    setStore(s => ({ ...s, days: { ...s.days, [day]: next } }));
    if (!wasChecked) {
      setCelebrateStamp(id);
      if (navigator.vibrate) navigator.vibrate(15);
      setTimeout(() => setCelebrateStamp(null), 600);
    }
  };

  if (!ready) return null;

  const progressToNext = nextLevel
    ? Math.min(100, ((totalStamps - level.min) / (nextLevel.min - level.min)) * 100)
    : 100;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }} className="passport-print">
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }} className="no-print">← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🛂 Паспорт Юного Агронома</h1>

        {/* ══ Паспорт-карточка ══ */}
        <div style={{
          background: 'var(--bg-elevated, #fff)',
          padding: 24, borderRadius: 24,
          border: `2px solid ${level.color}`,
          boxShadow: `0 4px 24px ${level.color}20`,
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
          {/* Аватар + имя */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <button
              onClick={() => setShowAvatars(!showAvatars)}
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: `${level.color}15`,
                border: `3px solid ${level.color}`,
                fontSize: 32, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >{store.avatar}</button>
            <div style={{ flex: 1 }}>
              <input
                value={store.name}
                onChange={e => setStore(s => ({ ...s, name: e.target.value }))}
                placeholder="Впиши своё имя"
                style={{
                  width: '100%', fontFamily: "'Playfair Display', serif",
                  fontSize: 22, fontWeight: 800,
                  border: 'none', borderBottom: '2px dashed var(--border, #ccc)',
                  background: 'transparent', color: 'var(--text-primary)',
                  padding: '4px 0',
                }}
              />
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 4 }}>
                Паспорт с {new Date(store.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </div>
            </div>
          </div>

          {/* Выбор аватара */}
          {showAvatars && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap',
              padding: '12px', marginBottom: 16,
              background: 'var(--bg-primary, #f5f5f5)', borderRadius: 16,
            }}>
              {AVATARS.map(a => (
                <button key={a} onClick={() => { setStore(s => ({ ...s, avatar: a })); setShowAvatars(false); }}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: store.avatar === a ? `2px solid ${level.color}` : '2px solid transparent',
                    background: store.avatar === a ? `${level.color}15` : 'transparent',
                    fontSize: 22, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{a}</button>
              ))}
            </div>
          )}

          {/* Статы */}
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 28 }}>{level.emoji}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: level.color }}>{level.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-primary, #3a7a32)', fontFamily: "'Playfair Display', serif" }}>{totalStamps}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)' }}>печатей</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Playfair Display', serif", color: '#c9a84c' }}>🔥{streak}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)' }}>дней подряд</div>
            </div>
          </div>

          {/* Прогресс до следующего уровня */}
          {nextLevel && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted, #999)', marginBottom: 4 }}>
                <span>{level.emoji} {level.name}</span>
                <span>{nextLevel.emoji} {nextLevel.name} ({nextLevel.min - totalStamps} ещё)</span>
              </div>
              <div style={{
                height: 8, borderRadius: 4,
                background: 'var(--bg-primary, #f0f0f0)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: `linear-gradient(90deg, ${level.color}, ${nextLevel.color})`,
                  width: `${progressToNext}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}

          {/* Ежедневные задания */}
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            color: 'var(--text-muted, #999)', marginBottom: 10,
          }}>{CATEGORY_LABELS.daily}</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
            {STAMPS.filter(s => s.category === 'daily').map(h => {
              const done = todayChecks.includes(h.id);
              const celebrating = celebrateStamp === h.id;
              return (
                <button key={h.id} onClick={() => toggle(h.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${done ? 'var(--brand-primary, #3a7a32)' : 'var(--border, #eee)'}`,
                  background: done ? 'rgba(58,122,50,0.12)' : 'transparent',
                  textAlign: 'left',
                  transform: celebrating ? 'scale(1.03)' : 'scale(1)',
                  transition: 'all 0.2s',
                }}>
                  <span style={{ fontSize: 26 }}>{h.emoji}</span>
                  <span style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{h.label}</span>
                  <span style={{
                    fontSize: 22,
                    transform: celebrating ? 'scale(1.3) rotate(10deg)' : 'scale(1)',
                    transition: 'transform 0.3s',
                  }}>{done ? '✅' : '⭕'}</span>
                </button>
              );
            })}
          </div>

          {/* Игровые достижения */}
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            color: 'var(--text-muted, #999)', marginBottom: 10,
          }}>{CATEGORY_LABELS.game}</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
            {STAMPS.filter(s => s.category === 'game').map(h => {
              const done = store.achievements.includes(h.id);
              return (
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 14,
                  border: `2px solid ${done ? '#7c3aed' : 'var(--border, #eee)'}`,
                  background: done ? 'rgba(124,58,237,0.08)' : 'transparent',
                  opacity: done ? 1 : 0.5,
                }}>
                  <span style={{ fontSize: 26 }}>{h.emoji}</span>
                  <span style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{h.label}</span>
                  <span style={{ fontSize: 22 }}>{done ? '⭐' : '🔒'}</span>
                </div>
              );
            })}
          </div>

          {/* AR-достижения */}
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            color: 'var(--text-muted, #999)', marginBottom: 10,
          }}>{CATEGORY_LABELS.ar}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {STAMPS.filter(s => s.category === 'ar').map(h => {
              const done = store.achievements.includes(h.id);
              return (
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 14,
                  border: `2px solid ${done ? '#f59e0b' : 'var(--border, #eee)'}`,
                  background: done ? 'rgba(245,158,11,0.08)' : 'transparent',
                  opacity: done ? 1 : 0.5,
                }}>
                  <span style={{ fontSize: 26 }}>{h.emoji}</span>
                  <span style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{h.label}</span>
                  <span style={{ fontSize: 22 }}>{done ? '⭐' : '🔒'}</span>
                </div>
              );
            })}
          </div>

          {/* Ссылки на активности */}
          <div style={{
            marginTop: 20, padding: '14px',
            background: 'var(--bg-primary, #f5f5f5)', borderRadius: 16,
            display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <Link href="/magazine/kids/riddles" style={linkBtn}>🔊 Загадки</Link>
            <Link href="/magazine/kids/tale" style={linkBtn}>📖 Сказка</Link>
            <Link href="/magazine/kids/food-art" style={{ ...linkBtn, background: '#f59e0b' }}>🎨 Фуд-арт</Link>
            <Link href="/magazine/kids/plant-quest" style={{ ...linkBtn, background: '#22c55e' }}>🌱 Посади</Link>
            <Link href="/magazine/kids/ar-coloring" style={{ ...linkBtn, background: '#ec4899' }}>🖌️ Раскраска</Link>
            <Link href="/magazine/ar" style={{ ...linkBtn, background: '#7c3aed' }}>📸 AR</Link>
          </div>
        </div>

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }} className="no-print">
          <button onClick={() => window.print()} style={actionBtn}>🖨 Распечатать</button>
          <button onClick={() => {
            if (confirm('Сбросить все данные паспорта?')) {
              setStore({ name: '', avatar: '🌱', days: {}, achievements: [], createdAt: today() });
            }
          }} style={{ ...actionBtn, background: 'transparent', color: 'var(--text-muted, #999)', border: '1px solid var(--border, #ccc)' }}>
            ↺ Сбросить
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: '#3a7a32', color: '#fff', border: 'none',
  borderRadius: 20, padding: '8px 16px',
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700,
  textDecoration: 'none', cursor: 'pointer',
};

const actionBtn: React.CSSProperties = {
  background: 'var(--brand-primary, #3a7a32)', color: '#fff',
  border: 'none', borderRadius: 30, padding: '10px 20px',
  fontFamily: "'Inter', sans-serif", fontWeight: 700, cursor: 'pointer',
};
