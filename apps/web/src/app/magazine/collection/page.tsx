'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CHARACTERS, RARITY_LABELS, RARITY_COLORS,
  loadCollection, collectionProgress,
  type CollectionEntry, type CollectionCharacter,
} from '@/lib/magazine/collection';

/* ─────────────────────────────────────────────
   Коллекция «Агро Друзья» — FRESH WEEKLY
   Витрина всех 6 персонажей + прогресс
   ───────────────────────────────────────────── */

export default function CollectionPage() {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedChar, setSelectedChar] = useState<CollectionCharacter | null>(null);

  useEffect(() => {
    setEntries(loadCollection());
    setReady(true);
  }, []);

  if (!ready) return null;

  const collected = new Set(entries.map(e => e.charId));
  const progress = collectionProgress();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)' }}>
      {/* Hero */}
      <section style={{
        padding: '100px 20px 40px', textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(74,222,128,0.05) 0%, transparent 100%)',
      }}>
        <Link href="/magazine" style={{
          fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)',
          textDecoration: 'none', fontSize: 14,
        }}>← Журнал</Link>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(36px, 7vw, 56px)', fontWeight: 900,
          lineHeight: 1.05, color: 'var(--text-primary)',
          margin: '16px auto 12px', maxWidth: 600,
        }}>
          Агро Друзья 🌿
        </h1>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16,
          color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto 24px',
          lineHeight: 1.6,
        }}>
          Коллекционные персонажи из журнала FRESH WEEKLY.
          Сканируй карточки через AR — собирай героев и получай бонусы в Farm Simulator.
        </p>

        {/* Прогресс */}
        <div style={{
          maxWidth: 400, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontFamily: "'Inter', sans-serif", fontSize: 13,
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Собрано</span>
            <span style={{ color: 'var(--brand-primary, #4ade80)', fontWeight: 700 }}>
              {progress.collected}/{progress.total} ({progress.percent}%)
            </span>
          </div>
          <div style={{
            height: 10, borderRadius: 5,
            background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 5,
              background: progress.percent === 100
                ? 'linear-gradient(90deg, #f59e0b, #ef4444, #ec4899, #8b5cf6, #3b82f6, #10b981)'
                : 'linear-gradient(90deg, #22c55e, #4ade80)',
              width: `${progress.percent}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>
          {progress.percent === 100 && (
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13,
              color: '#f59e0b', fontWeight: 700, textAlign: 'center',
            }}>
              🏆 Полная коллекция! Все бонусы активны в Farm Simulator
            </div>
          )}
        </div>
      </section>

      {/* Карточки персонажей */}
      <section style={{
        maxWidth: 900, margin: '0 auto',
        padding: '0 20px 60px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 20,
      }}>
        {CHARACTERS.map(char => {
          const unlocked = collected.has(char.id);
          const entry = entries.find(e => e.charId === char.id);
          return (
            <button
              key={char.id}
              onClick={() => setSelectedChar(char)}
              style={{
                background: unlocked
                  ? 'var(--bg-elevated, #fff)'
                  : 'var(--bg-elevated, rgba(255,255,255,0.03))',
                border: unlocked
                  ? `2px solid ${char.color}40`
                  : '2px solid var(--border, rgba(255,255,255,0.06))',
                borderRadius: 24,
                padding: 24,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
                opacity: unlocked ? 1 : 0.5,
                filter: unlocked ? 'none' : 'grayscale(0.5)',
              }}
            >
              {/* Rarity glow */}
              {unlocked && (
                <div style={{
                  position: 'absolute', top: -30, right: -30,
                  width: 100, height: 100, borderRadius: '50%',
                  background: `radial-gradient(circle, ${char.color}20, transparent)`,
                  pointerEvents: 'none',
                }} />
              )}

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{
                  fontSize: 48,
                  filter: unlocked ? 'none' : 'grayscale(1)',
                }}>{char.emoji}</span>
                <span style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  color: RARITY_COLORS[char.rarity],
                  background: `${RARITY_COLORS[char.rarity]}15`,
                  border: `1px solid ${RARITY_COLORS[char.rarity]}30`,
                  padding: '3px 10px', borderRadius: 12,
                }}>{RARITY_LABELS[char.rarity].ru}</span>
              </div>

              {/* Name */}
              <div style={{
                fontFamily: "'Playfair Display', serif", fontSize: 22,
                fontWeight: 800, color: 'var(--text-primary)',
                marginBottom: 6,
              }}>{char.name}</div>

              {/* Desc */}
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13,
                color: 'var(--text-secondary)', lineHeight: 1.5,
                marginBottom: 12,
              }}>{unlocked ? char.desc : '???'}</div>

              {/* Bonus */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 10,
                background: unlocked ? `${char.color}10` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${unlocked ? `${char.color}20` : 'transparent'}`,
              }}>
                <span style={{ fontSize: 14 }}>⚡</span>
                <span style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                  color: unlocked ? char.color : 'var(--text-muted, #999)',
                }}>{unlocked ? char.bonus : '???'}</span>
              </div>

              {/* Status */}
              <div style={{
                marginTop: 12,
                fontFamily: "'Inter', sans-serif", fontSize: 11,
                color: 'var(--text-muted, #999)',
              }}>
                {unlocked && entry
                  ? `Собран ${new Date(entry.unlockedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} через ${entry.source === 'ar' ? 'AR-сканер' : entry.source === 'game' ? 'Farm Simulator' : 'событие'}`
                  : '🔒 Не собран — сканируй карточку в AR'
                }
              </div>
            </button>
          );
        })}
      </section>

      {/* Как собирать */}
      <section style={{
        maxWidth: 700, margin: '0 auto', padding: '0 20px 80px',
      }}>
        <h2 style={{
          fontFamily: "'Playfair Display', serif", fontSize: 28,
          fontWeight: 800, color: 'var(--text-primary)',
          textAlign: 'center', marginBottom: 24,
        }}>Как собирать?</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {[
            { emoji: '📖', title: 'Возьми журнал', text: 'В каждом выпуске FRESH WEEKLY — коллекционная карточка с персонажем.' },
            { emoji: '📸', title: 'Открой AR-сканер', text: 'Нажми кнопку ниже и наведи камеру на карточку.' },
            { emoji: '✨', title: 'Персонаж оживёт!', text: '3D-модель появится прямо на карточке с эффектами и анимацией.' },
            { emoji: '🎮', title: 'Бонус в игре', text: 'Собранный персонаж становится компаньоном в Farm Simulator и даёт бонусы.' },
          ].map(step => (
            <div key={step.emoji} style={{
              display: 'flex', gap: 16, alignItems: 'flex-start',
              padding: '16px 20px', borderRadius: 16,
              background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
              border: '1px solid var(--border, rgba(255,255,255,0.06))',
            }}>
              <span style={{ fontSize: 32, flexShrink: 0 }}>{step.emoji}</span>
              <div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 15,
                  fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4,
                }}>{step.title}</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13,
                  color: 'var(--text-secondary)', lineHeight: 1.5,
                }}>{step.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/magazine/ar" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 28px', borderRadius: 30,
            background: 'linear-gradient(135deg, #2d5a27, #4ade80)',
            color: '#fff', fontFamily: "'Inter', sans-serif",
            fontSize: 16, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(74,222,128,0.3)',
          }}>
            📸 Открыть AR-сканер
          </Link>
          <Link href="/magazine/kids" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 28px', borderRadius: 30,
            background: 'transparent',
            border: '1px solid var(--border, #ccc)',
            color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif",
            fontSize: 16, fontWeight: 700, textDecoration: 'none',
          }}>
            🎮 Fresh Kids
          </Link>
        </div>
      </section>

      {/* Detail Modal */}
      {selectedChar && (
        <div
          onClick={() => setSelectedChar(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 400, width: '100%',
              background: 'var(--bg-elevated, #1a1a2e)',
              border: `2px solid ${selectedChar.color}40`,
              borderRadius: 28, padding: 32,
              boxShadow: `0 16px 64px ${selectedChar.color}20`,
              animation: 'modalIn 0.3s ease',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 72 }}>{selectedChar.emoji}</span>
            </div>
            <h3 style={{
              fontFamily: "'Playfair Display', serif", fontSize: 28,
              fontWeight: 900, color: 'var(--text-primary)', textAlign: 'center',
              marginBottom: 4,
            }}>{selectedChar.name}</h3>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.5,
                color: RARITY_COLORS[selectedChar.rarity],
                background: `${RARITY_COLORS[selectedChar.rarity]}15`,
                border: `1px solid ${RARITY_COLORS[selectedChar.rarity]}30`,
                padding: '4px 14px', borderRadius: 12,
              }}>{RARITY_LABELS[selectedChar.rarity].ru}</span>
            </div>
            <p style={{
              fontFamily: "'Inter', sans-serif", fontSize: 15,
              color: 'var(--text-secondary)', lineHeight: 1.6,
              textAlign: 'center', marginBottom: 16,
            }}>{selectedChar.desc}</p>
            <div style={{
              padding: '12px 16px', borderRadius: 14,
              background: `${selectedChar.color}10`,
              border: `1px solid ${selectedChar.color}25`,
              textAlign: 'center',
              marginBottom: 20,
            }}>
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700,
                color: selectedChar.color,
              }}>⚡ {selectedChar.bonus}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/magazine/ar" style={{
                flex: 1, padding: '12px',
                background: `linear-gradient(135deg, ${selectedChar.color}, ${selectedChar.glowColor})`,
                borderRadius: 14, color: '#000', textAlign: 'center',
                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
                textDecoration: 'none',
              }}>📸 Сканировать</Link>
              <button onClick={() => setSelectedChar(null)} style={{
                flex: 1, padding: '12px',
                background: 'transparent',
                border: '1px solid var(--border, #333)',
                borderRadius: 14, color: 'var(--text-primary)',
                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
