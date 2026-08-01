import Link from 'next/link';
import type { PublishedIssue } from './MagazineBentoGrid';

export function MagazineHeroCard({ latest }: { latest: PublishedIssue }) {
  return (
    <Link
      href={`/magazine/r/${latest.slug}`}
      style={{
        gridColumn: '1 / -1',
        gridRow: 'span 2',
        textDecoration: 'none',
        borderRadius: '24px',
        overflow: 'hidden',
        background: latest.brandPrimary
          ? `linear-gradient(135deg, ${latest.brandPrimary}, var(--editorial-cover-green-deep))`
          : 'linear-gradient(135deg, var(--editorial-cover-green), var(--editorial-cover-green-deep))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        minHeight: '400px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          padding: '8px 16px',
          background: 'rgba(var(--overlay-light-rgb), 0.1)',
          backdropFilter: 'blur(12px)',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--text-inverse)',
          letterSpacing: '2px',
          textTransform: 'uppercase',
        }}
      >
        Ресторан недели
      </div>
      <span style={{ fontSize: '64px', marginBottom: '24px' }}>🌿</span>
      <h3
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(32px, 5vw, 48px)',
          fontWeight: 800,
          color: 'var(--text-inverse)',
          textAlign: 'center',
          padding: '0 24px',
          lineHeight: 1.1,
          maxWidth: '800px',
        }}
      >
        {latest.title}
      </h3>
      <div
        style={{
          marginTop: '32px',
          padding: '12px 24px',
          background: 'var(--brand-primary)',
          borderRadius: '24px',
          color: 'var(--text-inverse)',
          fontWeight: 700,
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        Читать выпуск <span style={{ fontSize: '18px' }}>→</span>
      </div>
    </Link>
  );
}
