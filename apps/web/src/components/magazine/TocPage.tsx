import React from 'react';
import type { TocBlock, RestaurantBrand } from '@/lib/magazine/types';
import { UI, inline, type UIKey } from '@/lib/magazine/i18n';
import { Tri, PageNum, RunningHeader } from './blockParts';

function ui(key: UIKey) {
  return inline(key);
}

const H1: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontWeight: 900,
  color: 'var(--ink)',
  lineHeight: 1.1,
};
const BODY: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  color: 'var(--ink)',
  lineHeight: 1.6,
};

export function TocPage({
  b,
  brand,
  entries,
  n,
  weekLabel,
}: {
  b: TocBlock;
  brand: RestaurantBrand;
  entries: { letter: string; titles: string[]; page: number }[];
  n: number;
  weekLabel: string;
}) {
  return (
    <div className="mag-page">
      <RunningHeader right={`${ui('issue')} ${weekLabel}`} cobrand={brand.name.toUpperCase()} />
      <div style={{ padding: '8mm var(--margin-page) 6mm' }}>
        <div style={{ ...H1, fontSize: '22pt' }}>{UI.uz.contents}</div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '6.5pt',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--caption)',
            marginTop: '1mm',
          }}
        >
          {UI.ru.contents}
        </div>
        <div style={{ width: '20mm', height: '2px', background: 'var(--gold)', margin: '3mm 0 5mm' }} />
        <div>
          {entries.map((e, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                padding: '3mm 0',
                borderBottom: '0.5px solid var(--rule-light)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '17pt',
                  fontWeight: 800,
                  color: 'var(--accent)',
                  width: '12mm',
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                {e.letter}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '10.5pt',
                    fontWeight: 800,
                    color: 'var(--ink)',
                  }}
                >
                  {e.titles[0]}
                </div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: '7.5pt',
                    color: 'var(--caption)',
                    lineHeight: 1.3,
                  }}
                >
                  {e.titles.slice(1).join(' · ')}
                </div>
              </div>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '9pt',
                  fontWeight: 700,
                  color: 'var(--caption)',
                  paddingLeft: '4mm',
                }}
              >
                {e.page}
              </div>
            </div>
          ))}
        </div>
        {b.editorialNote && (
          <div style={{ marginTop: '5mm', borderTop: '2px solid var(--gold)', paddingTop: '3.5mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '2mm', fontSize: '6.5pt' }}>
              {ui('editorial')}
            </div>
            <Tri
              v={b.editorialNote}
              style={{ ...BODY, fontSize: '9.5pt', color: 'var(--ink-soft)', fontStyle: 'italic' }}
            />
          </div>
        )}
      </div>
      <PageNum n={n} />
    </div>
  );
}
