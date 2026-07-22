import Link from 'next/link';
import { listPublishedIssues } from '@/lib/magazine/data';
import { SECTION_TITLES_I18N } from '@/lib/magazine/i18n';
import { SECTION_ORDER } from '@/lib/magazine/types';

// Витрина журнала: показывает РЕАЛЬНЫЕ выпуски из БД (движок /magazine/r/<slug>).
export const dynamic = 'force-dynamic';

// Разделы, которые есть в каждом выпуске — для блока «В этом выпуске»
const SECTIONS = SECTION_ORDER
  .filter((t) => t !== 'cover' && t !== 'toc')
  .slice(0, 8)
  .map((t) => SECTION_TITLES_I18N.ru[t]);

export default async function MagazinePage() {
  const issues = await listPublishedIssues();
  const latest = issues[0];
  const archive = issues.slice(1);

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
        padding: '100px 20px 80px',
        textAlign: 'center',
        background: 'var(--bg-mesh)',
        borderBottom: '1px solid var(--border)',
      }}>
        <p style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '3px',
          color: 'var(--brand-primary)', textTransform: 'uppercase',
          marginBottom: '16px',
        }}>
          MICROGREEN UZBEKISTAN ПРЕДСТАВЛЯЕТ
        </p>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(48px, 8vw, 84px)', fontWeight: 900,
          lineHeight: 1.05, marginBottom: '24px',
          color: 'var(--text-primary)',
          letterSpacing: '-1px',
        }}>
          FRESH WEEKLY
        </h1>

        <p style={{
          fontSize: '18px', color: 'var(--text-secondary)',
          maxWidth: '560px', margin: '0 auto 40px', lineHeight: 1.6,
          fontWeight: 500,
        }}>
          Персональный журнал для гостей ресторана — на узбекском и русском.
          Рецепты, здоровье и детская рубрика с дополненной реальностью.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#latest" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '16px 32px', borderRadius: '30px',
            background: 'var(--brand-primary)', color: '#fff',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
          }}>
            📖 Смотреть выпуски
          </a>
          <Link href="/magazine/ar" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '16px 24px', borderRadius: '30px',
            background: 'rgba(124,58,237,0.15)', color: '#a78bfa',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            border: '1px solid rgba(124,58,237,0.3)',
          }}>
            📸 AR-сканер
          </Link>
          <Link href="/magazine/collection" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '16px 24px', borderRadius: '30px',
            background: 'rgba(245,158,11,0.1)', color: '#fbbf24',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            border: '1px solid rgba(245,158,11,0.2)',
          }}>
            🌿 Коллекция
          </Link>
          <Link href="/magazine/kids" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '16px 24px', borderRadius: '30px',
            background: 'rgba(236,72,153,0.1)', color: '#f472b6',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            border: '1px solid rgba(236,72,153,0.2)',
          }}>
            🎮 Fresh Kids
          </Link>
        </div>
      </section>

      {/* ═══════ LATEST ISSUE ═══════ */}
      <section id="latest" style={{
        maxWidth: '1200px', margin: '0 auto', padding: '60px 20px 80px',
      }}>
        {!latest ? (
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '24px', padding: '48px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📖</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Выпуски готовятся
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Как только выпуск недели будет опубликован, он появится здесь.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px'
            }}>
              <div>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 800,
                  color: 'var(--text-primary)', marginBottom: '8px',
                }}>
                  Свежий Выпуск
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Выпуск №{latest.weekNumber} • {latest.restaurantName}
                  {latest.restaurantCity ? ` • ${latest.restaurantCity}` : ''}
                </p>
              </div>
            </div>

            {/* BENTO GRID */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
              gridAutoRows: 'minmax(250px, auto)'
            }}>
              {/* Bento 1: обложка выпуска */}
              <Link href={`/magazine/r/${latest.slug}`} style={{
                gridColumn: '1 / -1',
                gridRow: 'span 2',
                textDecoration: 'none',
                borderRadius: '24px', overflow: 'hidden',
                background: latest.brandPrimary
                  ? `linear-gradient(135deg, ${latest.brandPrimary}, #0a2a0a)`
                  : 'linear-gradient(135deg, #1a3a1a, #0a2a0a)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                minHeight: '400px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-xl)',
              }}>
                <div style={{
                  position: 'absolute', top: '24px', left: '24px',
                  padding: '8px 16px', background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(12px)', borderRadius: '20px',
                  fontSize: '12px', fontWeight: 700, color: '#fff',
                  letterSpacing: '2px', textTransform: 'uppercase'
                }}>
                  Ресторан недели
                </div>
                <span style={{ fontSize: '64px', marginBottom: '24px' }}>🌿</span>
                <h3 style={{
                  fontFamily: "'Playfair Display', serif", fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800,
                  color: '#fff', textAlign: 'center', padding: '0 24px', lineHeight: 1.1, maxWidth: '800px'
                }}>
                  {latest.title}
                </h3>
                <div style={{
                  marginTop: '32px', padding: '12px 24px',
                  background: 'var(--brand-primary)', borderRadius: '24px',
                  color: '#fff', fontWeight: 700, fontSize: '14px',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  Читать выпуск <span style={{ fontSize: '18px' }}>→</span>
                </div>
              </Link>

              {/* Bento 2: цитата редакции */}
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: '24px', padding: '32px',
                border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: '16px' }}>
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                </svg>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', lineHeight: 1.5, color: 'var(--text-primary)', fontStyle: 'italic', marginBottom: '24px' }}>
                  «Здоровье начинается с того, что мы едим каждый день. Микрозелень — это концентрат энергии.»
                </p>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Из редакции
                </div>
              </div>

              {/* Bento 3: AR */}
              <Link href="/magazine/ar" style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(0,0,0,0))',
                borderRadius: '24px', padding: '32px', border: '1px solid var(--border)',
                textDecoration: 'none', position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📸</div>
                <h4 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>AR-Опыт</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>Оживи 3D персонажей</p>
              </Link>

              {/* Bento 4: разделы выпуска */}
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: '24px', padding: '32px',
                border: '1px solid var(--border)', gridColumn: '1 / -1'
              }}>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>В Этом Выпуске</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  {SECTIONS.map((label) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ fontSize: '18px', color: 'var(--brand-primary)' }}>•</span>
                      <h5 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</h5>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ═══════ ARCHIVE ═══════ */}
      {archive.length > 0 && (
        <section style={{ padding: '0 20px 80px', maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 800, marginBottom: '32px', color: 'var(--text-primary)' }}>
            Архив
          </h2>
          <div style={{
            display: 'flex', gap: '24px', overflowX: 'auto', paddingBottom: '24px', scrollbarWidth: 'none',
          }}>
            {archive.map((issue) => (
              <Link key={issue.slug} href={`/magazine/r/${issue.slug}`} style={{
                flex: '0 0 300px', textDecoration: 'none',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '20px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '160px',
                  background: issue.brandPrimary
                    ? `linear-gradient(135deg, ${issue.brandPrimary}, #1a202c)`
                    : 'linear-gradient(135deg, #2d3748, #1a202c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px'
                }}>
                  📖
                </div>
                <div style={{ padding: '24px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 700, marginBottom: '8px' }}>
                    №{issue.weekNumber} • {issue.restaurantName}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', lineHeight: 1.3 }}>
                    {issue.title}
                  </h3>
                  {issue.restaurantCity && (
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{issue.restaurantCity}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══════ SUBSCRIBE CTA ═══════ */}
      <section style={{
        maxWidth: '700px', margin: '0 auto', padding: '0 20px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(74,222,128,0.05))',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '24px', padding: '40px 32px',
        }}>
          <h3 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '28px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)'
          }}>
            Хотите бумажную версию?
          </h3>
          <p style={{
            fontSize: '15px', color: 'var(--text-secondary)',
            lineHeight: 1.6, marginBottom: '24px', maxWidth: '450px', margin: '0 auto 24px',
          }}>
            Премиум-печать на плотной бумаге, 12 страниц A5.
            Закажите через Telegram и получите с доставкой.
          </p>
          <a
            href="https://t.me/fresh_weekly_uz"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '16px 32px', borderRadius: '30px',
              background: '#229ED9', color: '#fff',
              fontWeight: 700, fontSize: '15px', textDecoration: 'none',
              boxShadow: '0 8px 24px rgba(34,158,217,0.3)',
            }}
          >
            📲 Заказать в Telegram
          </a>
        </div>
      </section>
    </div>
  );
}
