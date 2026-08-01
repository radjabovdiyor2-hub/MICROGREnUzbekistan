import React from 'react';
import type { CoverBlock, RestaurantBrand, L10n } from '@/lib/magazine/types';
import { t, tri, type Lang } from '@/lib/magazine/i18n';

const PRIMARY: Lang = 'uz';

export function CoverPage({
  b,
  brand,
  weekLabel,
}: {
  b: CoverBlock;
  brand: RestaurantBrand;
  weekLabel: string;
}) {
  const titleParts = tri(b.title);
  const accentParts = tri(b.accentTitle);
  return (
    <div
      className="mag-page"
      style={{ background: 'rgb(var(--overlay-dark-rgb))', color: 'rgb(var(--overlay-light-rgb))' }}
    >
      {b.background && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <img
            src={b.background}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }}
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg,rgba(var(--overlay-dark-rgb), 0.5) 0%,rgba(var(--overlay-dark-rgb), 0.1) 35%,rgba(var(--overlay-dark-rgb), 0.05) 55%,rgba(var(--overlay-dark-rgb), 0.7) 85%,rgba(var(--overlay-dark-rgb), 0.85) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '210mm',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '5mm 10mm 0', textAlign: 'center' }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '6pt',
              fontWeight: 700,
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
              color: 'var(--editorial-gold-light)',
            }}
          >
            Microgreen Uzbekistan
            <span style={{ opacity: 0.55, margin: '0 2.5mm' }}>&amp;</span>
            {brand.name}
          </span>
        </div>
        <div
          style={{
            padding: '3mm 10mm 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '36pt',
                fontWeight: 900,
                lineHeight: 0.9,
              }}
            >
              FRESH
            </div>
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '7pt',
                fontWeight: 700,
                letterSpacing: '10px',
                color: 'rgba(var(--overlay-light-rgb), 0.5)',
                marginTop: '2mm',
              }}
            >
              WEEKLY
            </div>
          </div>
          <div
            style={{
              textAlign: 'right',
              fontFamily: "'Inter', sans-serif",
              fontSize: '7pt',
              color: 'rgba(var(--overlay-light-rgb), 0.6)',
              lineHeight: 1.8,
            }}
          >
            <span
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '10pt',
                fontWeight: 900,
                color: 'rgba(var(--overlay-light-rgb), 0.9)',
              }}
            >
              {weekLabel}
            </span>
            <br />
            UZ · RU
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '0 10mm 18mm',
          }}
        >
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '26pt',
              fontWeight: 900,
              lineHeight: 1.1,
              maxWidth: '92%',
            }}
          >
            <span style={{ color: 'var(--editorial-gold-light)' }}>{titleParts[0]?.text}</span>
            {accentParts[0] && (
              <>
                <br />
                {accentParts[0].text}
              </>
            )}
          </div>
          {(titleParts.length > 1 || accentParts.length > 1) && (
            <div
              style={{
                marginTop: '3mm',
                borderLeft: '1.5px solid color-mix(in srgb, var(--editorial-gold-light) 50%, transparent)',
                paddingLeft: '3mm',
              }}
            >
              {titleParts.slice(1).map((p, i) => (
                <div
                  key={p.lang}
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '11pt',
                    fontWeight: 700,
                    color: 'rgba(var(--overlay-light-rgb), 0.72)',
                    lineHeight: 1.25,
                  }}
                >
                  {p.text} {accentParts[i + 1]?.text ?? ''}
                </div>
              ))}
            </div>
          )}
          {b.subtitle && (
            <div style={{ marginTop: '4mm', maxWidth: '86%' }}>
              {tri(b.subtitle).map((p) => (
                <div
                  key={p.lang}
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: p.lang === PRIMARY ? '10.5pt' : '8pt',
                    color:
                      p.lang === PRIMARY
                        ? 'rgba(var(--overlay-light-rgb), 0.8)'
                        : 'rgba(var(--overlay-light-rgb), 0.55)',
                    fontStyle: 'italic',
                    lineHeight: 1.4,
                  }}
                >
                  {p.text}
                </div>
              ))}
            </div>
          )}
          {b.tags && b.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '3mm', marginTop: '5mm', flexWrap: 'wrap' }}>
              {b.tags.map((tag, i) => (
                <span
                  key={i}
                  className="mag-kicker"
                  style={{ color: 'rgba(var(--overlay-light-rgb), 0.5)' }}
                >
                  {t(tag as L10n, PRIMARY)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div
          style={{
            background: 'rgba(var(--overlay-dark-rgb), 0.5)',
            padding: '3.5mm 10mm',
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: "'Inter', sans-serif",
            fontSize: '6.5pt',
            color: 'rgba(var(--overlay-light-rgb), 0.5)',
          }}
        >
          <span>© Microgreen Uzbekistan &amp; {brand.name}</span>
          <span style={{ color: 'var(--editorial-gold-light)', fontWeight: 600 }}>freshweekly.uz</span>
        </div>
      </div>
    </div>
  );
}
