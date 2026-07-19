'use client';

import { useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   FRESH WEEKLY — Цифровая версия журнала
   Роут: microgreenuzbekistan.com/magazine
   ───────────────────────────────────────────── */

const ISSUES = [
  {
    id: 2,
    title: 'Стрит-фуд, Пибимпаб и Азиатские тренды',
    date: 'Декабрь 2023',
    cover: '/magazine/cover_issue_02.png',
    highlights: [
      { icon: '🍜', label: 'Корейский стрит-фуд' },
      { icon: '🥩', label: 'Пибимпаб с микрозеленью' },
      { icon: '🌶', label: 'Острые азиатские вкусы' },
      { icon: '🌱', label: 'Дайкон и кинза в деле' },
    ],
    pdfUrl: '/magazine/fresh_weekly_02.pdf',
  },
  {
    id: 1,
    title: 'Сладкое + Острое: новая эра вкуса',
    date: 'Ноябрь 2023',
    cover: '/magazine/cover-01.png',
    highlights: [
      { icon: '🍽', label: 'ORA — Ресторан недели' },
      { icon: '🌍', label: 'Нон-кабоб: стрит-фуд мира' },
      { icon: '🍰', label: 'Чизкейк «Цветочный сад»' },
      { icon: '🎨', label: 'Hot Honey: мёд + чили' },
    ],
    pdfUrl: '/magazine/fresh_weekly_01.pdf',
  },
];

export default function MagazinePage() {
  const [hoveredIssue, setHoveredIssue] = useState<number | null>(null);
  const latestIssue = ISSUES[0];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #0B0B14)',
      color: 'var(--text-primary, #fff)',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* ═══════ HERO SECTION ═══════ */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '80px 20px 60px',
        textAlign: 'center',
        background: 'linear-gradient(180deg, #0a1a0f 0%, #0B0B14 100%)',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <p style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '3px',
          color: 'var(--brand-primary, #10B981)', textTransform: 'uppercase',
          marginBottom: '12px',
        }}>
          MICROGREEN UZBEKISTAN ПРЕДСТАВЛЯЕТ
        </p>

        <h1 style={{
          fontFamily: "'Outfit', 'Inter', sans-serif",
          fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 800,
          lineHeight: 1.1, marginBottom: '16px',
          background: 'linear-gradient(135deg, #4ade80, #10B981, #059669)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          FRESH WEEKLY
        </h1>

        <p style={{
          fontSize: '16px', color: 'rgba(255,255,255,0.6)',
          maxWidth: '500px', margin: '0 auto 32px', lineHeight: 1.6,
        }}>
          Еженедельный журнал о ресторанах, стрит-фуде, рецептах,
          здоровье и технологиях. С дополненной реальностью.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#latest" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '14px 28px', borderRadius: '12px',
            background: 'var(--brand-primary, #10B981)', color: '#fff',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            📖 Читать выпуск №1
          </a>
          <Link href="/magazine/ar" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '14px 28px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            fontWeight: 600, fontSize: '15px', textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            transition: 'transform 0.2s, background 0.2s',
          }}>
            📸 AR-Магия
          </Link>
        </div>
      </section>

      {/* ═══════ LATEST ISSUE ═══════ */}
      <section id="latest" style={{
        maxWidth: '900px', margin: '0 auto', padding: '40px 20px 80px',
      }}>
        <h2 style={{
          fontFamily: "'Outfit', sans-serif", fontSize: '28px', fontWeight: 700,
          marginBottom: '8px',
        }}>
          📰 Последний выпуск
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>
          {latestIssue.date} • Выпуск №{latestIssue.id}
        </p>

        {/* Issue card */}
        <div
          onMouseEnter={() => setHoveredIssue(latestIssue.id)}
          onMouseLeave={() => setHoveredIssue(null)}
          style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hoveredIssue === latestIssue.id ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '20px', padding: '32px',
            transition: 'border-color 0.3s, box-shadow 0.3s',
            boxShadow: hoveredIssue === latestIssue.id ? '0 8px 40px rgba(16,185,129,0.1)' : 'none',
          }}
        >
          {/* Cover placeholder */}
          <div style={{
            aspectRatio: '148 / 210', borderRadius: '12px', overflow: 'hidden',
            background: 'linear-gradient(135deg, #1a3a1a, #0a2a0a)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(74,222,128,0.2)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '12px', background: 'rgba(0,0,0,0.5)',
              fontSize: '10px', fontWeight: 700, color: '#4ade80',
              letterSpacing: '2px', textAlign: 'center',
            }}>
              FRESH WEEKLY
            </div>
            <span style={{ fontSize: '48px', marginBottom: '8px' }}>🔥</span>
            <p style={{
              fontFamily: "'Outfit', sans-serif", fontSize: '16px', fontWeight: 700,
              color: '#fff', textAlign: 'center', padding: '0 16px', lineHeight: 1.3,
            }}>
              {latestIssue.title}
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
              №{latestIssue.id} • {latestIssue.date}
            </p>
          </div>

          {/* Content highlights */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{
              fontSize: '22px', fontWeight: 700, marginBottom: '20px',
              fontFamily: "'Outfit', sans-serif",
            }}>
              В этом выпуске:
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {latestIssue.highlights.map((h, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'background 0.2s',
                }}>
                  <span style={{ fontSize: '20px' }}>{h.icon}</span>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{h.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href="/content/fresh_weekly_issue_01.html" target="_blank" style={{
                padding: '12px 20px', borderRadius: '10px',
                background: 'var(--brand-primary, #10B981)', color: '#fff',
                fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                transition: 'transform 0.2s',
              }}>
                📖 Читать онлайн
              </a>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '12px 20px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.08)', color: '#fff',
                  fontWeight: 600, fontSize: '14px', border: '1px solid rgba(255,255,255,0.12)',
                  cursor: 'pointer', transition: 'background 0.2s',
                }}
              >
                🖨 Печать PDF
              </button>
              <Link href="/magazine/ar" style={{
                padding: '12px 20px', borderRadius: '10px',
                background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                fontWeight: 600, fontSize: '14px', textDecoration: 'none',
                border: '1px solid rgba(74,222,128,0.2)',
                transition: 'background 0.2s',
              }}>
                ✨ AR-Магия
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ SUBSCRIBE CTA ═══════ */}
      <section style={{
        maxWidth: '700px', margin: '0 auto', padding: '0 20px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(74,222,128,0.05))',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '20px', padding: '40px 32px',
        }}>
          <h3 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '24px', fontWeight: 700, marginBottom: '12px',
          }}>
            🖨 Хотите бумажную версию?
          </h3>
          <p style={{
            fontSize: '15px', color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.6, marginBottom: '24px', maxWidth: '450px', margin: '0 auto 24px',
          }}>
            Печатная версия — только у нас. Премиум-печать на плотной бумаге, 12 страниц A5.
            Закажите через Telegram и получите с доставкой.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={{
              padding: '10px 20px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              fontSize: '14px', color: 'rgba(255,255,255,0.8)',
            }}>
              💰 15,000 сум / выпуск
            </div>
            <div style={{
              padding: '10px 20px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              fontSize: '14px', color: 'rgba(255,255,255,0.8)',
            }}>
              📦 50,000 сум / мес (4 выпуска)
            </div>
          </div>
          <a
            href="https://t.me/fresh_weekly_uz"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              marginTop: '24px', padding: '14px 28px', borderRadius: '12px',
              background: '#229ED9', color: '#fff',
              fontWeight: 700, fontSize: '15px', textDecoration: 'none',
              boxShadow: '0 4px 15px rgba(34,158,217,0.3)',
            }}
          >
            📲 Заказать в Telegram
          </a>
        </div>
      </section>

      {/* ═══════ AR PROMO ═══════ */}
      <section style={{
        maxWidth: '700px', margin: '0 auto', padding: '0 20px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px', padding: '40px 32px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-50%', right: '-30%',
            width: '300px', height: '300px',
            background: 'radial-gradient(circle, rgba(250,204,21,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <h3 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '24px', fontWeight: 700, marginBottom: '12px',
          }}>
            ✨ Дополненная реальность
          </h3>
          <p style={{
            fontSize: '15px', color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.6, maxWidth: '450px', margin: '0 auto 24px',
          }}>
            Наведите камеру телефона на карточку персонажа в печатном журнале —
            и он оживёт прямо на бумаге! Никаких приложений — всё работает в браузере.
          </p>
          <Link href="/magazine/ar" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '14px 28px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #4ade80, #10B981)',
            color: '#fff', fontWeight: 700, fontSize: '15px',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(74,222,128,0.3)',
          }}>
            📸 Попробовать AR-сканер
          </Link>
        </div>
      </section>
    </div>
  );
}
