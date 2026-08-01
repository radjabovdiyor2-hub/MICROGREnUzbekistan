import Link from 'next/link';
import { listPublishedIssues, listUploadedMagazines } from '@/lib/magazine/data';
import { SECTION_TITLES_I18N } from '@/lib/magazine/i18n';
import { SECTION_ORDER } from '@/lib/magazine/types';
import { MagazineBentoGrid } from './MagazineBentoGrid';

// Витрина журнала: показывает РЕАЛЬНЫЕ выпуски из БД (движок /magazine/r/<slug>).
export const dynamic = 'force-dynamic';

const SECTIONS = SECTION_ORDER
  .filter((t) => t !== 'cover' && t !== 'toc')
  .slice(0, 8)
  .map((t) => SECTION_TITLES_I18N.ru[t]);

export default async function MagazinePage() {
  const [issues, uploaded] = await Promise.all([
    listPublishedIssues(),
    listUploadedMagazines(),
  ]);
  const latest = issues[0];
  const archive = issues.slice(1);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary, rgb(var(--overlay-light-rgb)))',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* HERO */}
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
          Рецепты, здоровье и живое меню ресторана — прямо со страницы.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#latest" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '16px 32px', borderRadius: '30px',
            background: 'var(--brand-primary)', color: 'var(--text-inverse)',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(var(--brand-primary-rgb), 0.4)',
          }}>
            📖 Смотреть выпуски
          </a>
        </div>
      </section>

      {/* LATEST ISSUE */}
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
          <MagazineBentoGrid latest={latest} sections={SECTIONS} />
        )}
      </section>

      {/* ARCHIVE */}
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
                    ? `linear-gradient(135deg, ${issue.brandPrimary}, var(--editorial-cover-slate-deep))`
                    : 'linear-gradient(135deg, var(--editorial-cover-slate), var(--editorial-cover-slate-deep))',
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

      {/* UPLOADED MAGAZINES */}
      {uploaded.length > 0 && (
        <section style={{ padding: '0 20px 80px', maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 800, marginBottom: '32px', color: 'var(--text-primary)' }}>
            Журналы партнёров
          </h2>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px',
          }}>
            {uploaded.map((mag) => (
              <a
                key={mag.slug}
                href={mag.htmlUrl || mag.pdfUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: 'none',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '20px', overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
              >
                <div style={{
                  height: '140px',
                  background: mag.brandPrimary
                    ? `linear-gradient(135deg, ${mag.brandPrimary}, var(--editorial-cover-slate-deep))`
                    : 'linear-gradient(135deg, var(--editorial-cover-green-mid), var(--editorial-cover-green-deep))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {mag.logo
                    ? <img src={mag.logo} alt="" style={{ maxHeight: 60, maxWidth: 120, objectFit: 'contain' }} />
                    : <span style={{ fontSize: '40px' }}>📖</span>}
                </div>
                <div style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {mag.restaurantName}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {mag.htmlUrl && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(var(--brand-primary-rgb), 0.15)', color: 'var(--brand-primary)' }}>HTML</span>}
                    {mag.pdfUrl && <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'color-mix(in srgb, var(--info) 15%, transparent)', color: 'var(--info)' }}>PDF</span>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* SUBSCRIBE CTA */}
      <section style={{
        maxWidth: '700px', margin: '0 auto', padding: '0 20px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.1), rgba(var(--brand-primary-rgb), 0.05))',
          border: '1px solid rgba(var(--brand-primary-rgb), 0.2)',
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
              background: 'var(--social-telegram-bright)', color: 'var(--text-inverse)',
              fontWeight: 700, fontSize: '15px', textDecoration: 'none',
              boxShadow: '0 8px 24px color-mix(in srgb, var(--social-telegram-bright) 30%, transparent)',
            }}
          >
            📲 Заказать в Telegram
          </a>
        </div>
      </section>
    </div>
  );
}
