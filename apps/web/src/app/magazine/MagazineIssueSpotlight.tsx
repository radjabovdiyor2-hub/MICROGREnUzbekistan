import Image from 'next/image';

import type { IssueCard } from '@/lib/magazine/content';

// Свежий номер на витрине: обложка, о чём он и две двери — читать онлайн
// или забрать PDF. Обе ведут на файлы, опубликованные скриптом в
// public/magazine, поэтому кнопка показывается только когда файл заявлен.
export function MagazineIssueSpotlight({ issue }: { issue: IssueCard }) {
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '14px 26px', borderRadius: 30, fontWeight: 700,
    fontSize: 15, textDecoration: 'none',
  };

  return (
    <section
      style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 32, alignItems: 'center',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 24, padding: 32,
      }}
    >
      <div
        style={{
          // `position: relative` — опора для `fill` у обложки.
          position: 'relative',
          aspectRatio: '148 / 210', borderRadius: 16, overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--editorial-cover-green), var(--editorial-cover-green-deep))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          maxWidth: 320, width: '100%', margin: '0 auto',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* ЧЕРЕЗ next/image, А НЕ ОБЫЧНЫЙ <img>.
            Обложка лежит исходником со сканера — 1,2 МБ JPEG, и раньше он
            уезжал посетителю целиком. Замер главной на прод-сборке с
            телефонного экрана: 2307 КБ всего, из них 2306 КБ — эта
            картинка. То есть весь вес страницы был ею одной.

            `next/image` отдаёт avif/webp нужного размера (настройка в
            next.config.ts) — коробка тут не шире 320 CSS-пикселей.
            `sizes` обязателен при `fill`: без него берётся самый крупный
            вариант, и смысл теряется. */}
        {issue.coverImage
          ? (
            <Image
              src={issue.coverImage}
              alt={issue.titleRu}
              fill
              sizes="(max-width: 480px) 90vw, 320px"
              style={{ objectFit: 'cover' }}
            />
          )
          : <span style={{ fontSize: 56 }}>📖</span>}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--brand-primary)' }}>
          Свежий номер · №{issue.number}
          {issue.restaurantName ? ` · ${issue.restaurantName}` : ''}
        </div>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15, margin: '12px 0 6px' }}>
          {issue.titleRu}
        </h2>
        {issue.titleUz && (
          <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>{issue.titleUz}</div>
        )}

        {issue.summaryRu && (
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: 14 }}>
            {issue.summaryRu}
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
          {issue.webUrl && (
            <a
              href={issue.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btn, background: 'var(--brand-primary)', color: 'var(--text-inverse)' }}
            >
              📖 Читать онлайн
            </a>
          )}
          {issue.pdfUrl && (
            <a
              href={issue.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btn, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              ⬇ Скачать PDF
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
