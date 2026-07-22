'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   Квест «Посади и Съешь» — FRESH WEEKLY
   Ребёнок отслеживает рост микрозелени:
   посадка → полив → уход → урожай → блюдо.
   Прогресс сохраняется в localStorage.
   ───────────────────────────────────────────── */

interface PlantEntry {
  id: string;
  plantType: string;
  plantEmoji: string;
  startDate: string;
  lastWatered: string;
  waterCount: number;
  stage: number; // 0-4
  dish: string;
  note: string;
}

const PLANT_TYPES = [
  { id: 'radish', name: 'Редис', emoji: '🌱', days: 5, dish: 'Салат с микрозеленью редиса' },
  { id: 'pea', name: 'Горох', emoji: '🫛', days: 7, dish: 'Сэндвич с ростками гороха' },
  { id: 'sunflower', name: 'Подсолнух', emoji: '🌻', days: 6, dish: 'Смузи с проростками' },
  { id: 'broccoli', name: 'Брокколи', emoji: '🥦', days: 8, dish: 'Суп с микроброкколи' },
  { id: 'basil', name: 'Базилик', emoji: '🌿', days: 10, dish: 'Песто из микробазилика' },
  { id: 'mustard', name: 'Горчица', emoji: '🟡', days: 4, dish: 'Бутерброд с горчичной зеленью' },
];

const STAGES = [
  { name: 'Семечко', emoji: '🌰', desc: 'Замочи семена на 6-8 часов' },
  { name: 'Проклюнулся', emoji: '🌱', desc: 'Появился белый корешок' },
  { name: 'Росточек', emoji: '🌿', desc: 'Первые зелёные листики' },
  { name: 'Растёт!', emoji: '🪴', desc: 'Листья раскрылись — поливай каждый день' },
  { name: 'Урожай!', emoji: '🎉', desc: 'Готово! Пора собирать и готовить' },
];

const STORAGE_KEY = 'fw_plant_quest';

function loadPlants(): PlantEntry[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function savePlants(plants: PlantEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
}

export default function PlantQuestPage() {
  const [plants, setPlants] = useState<PlantEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [showNewPlant, setShowNewPlant] = useState(false);
  const [selectedType, setSelectedType] = useState(PLANT_TYPES[0].id);

  useEffect(() => {
    setPlants(loadPlants());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) savePlants(plants);
  }, [plants, ready]);

  const addPlant = () => {
    const type = PLANT_TYPES.find(t => t.id === selectedType)!;
    const newPlant: PlantEntry = {
      id: `${Date.now()}`,
      plantType: type.id,
      plantEmoji: type.emoji,
      startDate: new Date().toISOString(),
      lastWatered: new Date().toISOString(),
      waterCount: 0,
      stage: 0,
      dish: type.dish,
      note: '',
    };
    setPlants(prev => [newPlant, ...prev]);
    setShowNewPlant(false);
  };

  const waterPlant = (id: string) => {
    setPlants(prev => prev.map(p => {
      if (p.id !== id) return p;
      const newCount = p.waterCount + 1;
      const type = PLANT_TYPES.find(t => t.id === p.plantType);
      const daysToHarvest = type?.days || 7;
      // Авто-продвижение стадии
      const stageThresholds = [0, 2, Math.floor(daysToHarvest * 0.4), Math.floor(daysToHarvest * 0.7), daysToHarvest];
      let newStage = p.stage;
      for (let s = 4; s >= 0; s--) {
        if (newCount >= stageThresholds[s]) { newStage = s; break; }
      }
      return {
        ...p,
        waterCount: newCount,
        lastWatered: new Date().toISOString(),
        stage: Math.max(p.stage, newStage), // Стадия только растёт
      };
    }));
    if (navigator.vibrate) navigator.vibrate(15);
  };

  const advanceStage = (id: string) => {
    setPlants(prev => prev.map(p =>
      p.id === id ? { ...p, stage: Math.min(4, p.stage + 1) } : p
    ));
  };

  const removePlant = (id: string) => {
    setPlants(prev => prev.filter(p => p.id !== id));
  };

  const harvestedCount = plants.filter(p => p.stage >= 4).length;


  if (!ready) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🌱 Посади и Съешь</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          Посади семена из журнала, отмечай полив каждый день и собери свой первый урожай микрозелени!
        </p>

        {/* Статистика */}
        {plants.length > 0 && (
          <div style={{
            display: 'flex', gap: 12, marginBottom: 20,
          }}>
            <div style={{
              flex: 1, padding: '12px 16px', borderRadius: 16,
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-primary, #4ade80)', fontFamily: "'Playfair Display', serif" }}>{plants.length}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-secondary)' }}>посажено</div>
            </div>
            <div style={{
              flex: 1, padding: '12px 16px', borderRadius: 16,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', fontFamily: "'Playfair Display', serif" }}>{harvestedCount}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-secondary)' }}>урожаев</div>
            </div>
            <div style={{
              flex: 1, padding: '12px 16px', borderRadius: 16,
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6', fontFamily: "'Playfair Display', serif" }}>{plants.reduce((s, p) => s + p.waterCount, 0)}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-secondary)' }}>поливов</div>
            </div>
          </div>
        )}

        {/* Кнопка посадить */}
        <button onClick={() => setShowNewPlant(!showNewPlant)} style={{
          width: '100%', padding: '14px', borderRadius: 16,
          background: showNewPlant ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)',
          border: `1px solid ${showNewPlant ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
          color: showNewPlant ? '#ef4444' : 'var(--brand-primary, #4ade80)',
          fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700,
          cursor: 'pointer', marginBottom: 16,
        }}>
          {showNewPlant ? '✕ Отмена' : '+ Посадить новый росток'}
        </button>

        {/* Форма посадки */}
        {showNewPlant && (
          <div style={{
            padding: 20, borderRadius: 20,
            background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
            border: '1px solid var(--border, #333)',
            marginBottom: 20,
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Что сажаем?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {PLANT_TYPES.map(type => (
                <button key={type.id} onClick={() => setSelectedType(type.id)} style={{
                  padding: '12px 8px', borderRadius: 14, textAlign: 'center',
                  border: selectedType === type.id ? '2px solid var(--brand-primary, #4ade80)' : '1px solid var(--border, #333)',
                  background: selectedType === type.id ? 'rgba(74,222,128,0.1)' : 'transparent',
                  cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 28 }}>{type.emoji}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{type.name}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: 'var(--text-muted, #999)' }}>~{type.days} дн.</div>
                </button>
              ))}
            </div>
            <button onClick={addPlant} style={{
              width: '100%', padding: '12px', borderRadius: 14,
              background: 'var(--brand-primary, #3a7a32)', color: '#fff', border: 'none',
              fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>🌱 Посадить!</button>
          </div>
        )}

        {/* Список растений */}
        {plants.length === 0 && !showNewPlant && (
          <div style={{
            padding: 40, textAlign: 'center',
            background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
            borderRadius: 20, border: '1px solid var(--border, #333)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌰</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8 }}>Ещё ничего не посажено</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-muted, #999)' }}>
              Возьми семена из журнала и начни квест!
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          {plants.map(plant => {
            const type = PLANT_TYPES.find(t => t.id === plant.plantType);
            const stage = STAGES[plant.stage];
            const isHarvested = plant.stage >= 4;
            const daysSincePlanting = Math.floor((Date.now() - new Date(plant.startDate).getTime()) / 86400000);
            const lastWateredToday = new Date(plant.lastWatered).toDateString() === new Date().toDateString();

            return (
              <div key={plant.id} style={{
                padding: 20, borderRadius: 20,
                background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
                border: isHarvested ? '2px solid rgba(245,158,11,0.3)' : '1px solid var(--border, #333)',
                position: 'relative',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 36 }}>{stage.emoji}</span>
                    <div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {type?.name || plant.plantType}
                      </div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)' }}>
                        {stage.name} · День {daysSincePlanting + 1}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => removePlant(plant.id)} style={{
                    width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                    background: 'transparent', color: '#ef4444', cursor: 'pointer',
                    fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>

                {/* Прогресс стадий */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {STAGES.map((s, idx) => (
                    <div key={s.name} style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: idx <= plant.stage
                        ? isHarvested ? '#f59e0b' : 'var(--brand-primary, #4ade80)'
                        : 'var(--bg-primary, rgba(255,255,255,0.05))',
                      transition: 'background 0.3s',
                    }} />
                  ))}
                </div>

                {/* Подсказка */}
                <div style={{
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(74,222,128,0.05)',
                  fontFamily: "'Inter', sans-serif", fontSize: 13,
                  color: 'var(--text-secondary)', marginBottom: 12,
                }}>
                  💡 {stage.desc}
                </div>

                {/* Кнопки */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!isHarvested && (
                    <>
                      <button
                        onClick={() => waterPlant(plant.id)}
                        disabled={lastWateredToday}
                        style={{
                          padding: '8px 16px', borderRadius: 12,
                          background: lastWateredToday ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.15)',
                          border: '1px solid rgba(59,130,246,0.2)',
                          color: lastWateredToday ? 'var(--text-muted, #999)' : '#3b82f6',
                          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                          cursor: lastWateredToday ? 'default' : 'pointer',
                        }}
                      >{lastWateredToday ? '✓ Полит сегодня' : '💧 Полить'}</button>
                      <button onClick={() => advanceStage(plant.id)} style={{
                        padding: '8px 16px', borderRadius: 12,
                        background: 'rgba(74,222,128,0.1)',
                        border: '1px solid rgba(74,222,128,0.2)',
                        color: 'var(--brand-primary, #4ade80)',
                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}>📷 Отметить рост</button>
                    </>
                  )}
                  {isHarvested && (
                    <div style={{
                      padding: '10px 16px', borderRadius: 12,
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
                      color: '#f59e0b',
                    }}>
                      🍽 Попробуй приготовить: {plant.dish}
                    </div>
                  )}
                </div>

                {/* Счётчик поливов */}
                <div style={{
                  marginTop: 10,
                  fontFamily: "'Inter', sans-serif", fontSize: 11,
                  color: 'var(--text-muted, #999)',
                }}>
                  💧 {plant.waterCount} поливов
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
