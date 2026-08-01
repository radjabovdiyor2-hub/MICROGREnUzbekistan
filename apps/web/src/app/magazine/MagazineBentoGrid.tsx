import Link from 'next/link';

export interface PublishedIssue {
  slug: string;
  weekNumber: number;
  restaurantName: string;
  restaurantCity?: string | null;
  brandPrimary?: string | null;
  title: string;
}

export function MagazineBentoGrid({
  latest,
  sections,
}: {
  latest: PublishedIssue;
  sections: string[];
}) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '36px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Свежий Выпуск
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            Выпуск №{latest.weekNumber} • {latest.restaurantName}
            {latest.restaurantCity ? ` • ${latest.restaurantCity}` : ''}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          gridAutoRows: 'minmax(250px, auto)',
        }}
      >
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

        <div
          style={{
            background: 'var(--bg-elevated)',
            borderRadius: '24px',
            padding: '32px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.5, marginBottom: '16px' }}
          >
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
          </svg>
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px',
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              fontStyle: 'italic',
              marginBottom: '24px',
            }}
          >
            «Здоровье начинается с того, что мы едим каждый день. Микрозелень — это концентрат энергии.»
          </p>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Из редакции
          </div>
        </div>

        <div
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.1), rgba(var(--overlay-dark-rgb), 0))',
            borderRadius: '24px',
            padding: '32px',
            border: '1px solid var(--border)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📸</div>
          <h4 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Живое меню
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
            QR у блюда → состав, цена и кадр для сторис
          </p>
        </div>

        <div
          style={{
            background: 'var(--bg-elevated)',
            borderRadius: '24px',
            padding: '32px',
            border: '1px solid var(--border)',
            gridColumn: '1 / -1',
          }}
        >
          <h4
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '24px',
            }}
          >
            В Этом Выпуске
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
            }}
          >
            {sections.map((label) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ fontSize: '18px', color: 'var(--brand-primary)' }}>•</span>
                <h5 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</h5>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
