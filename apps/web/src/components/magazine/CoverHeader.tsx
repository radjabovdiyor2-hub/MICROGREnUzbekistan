import React from 'react';
import type { RestaurantBrand } from '@/lib/magazine/types';

export function CoverHeader({
  brand,
  weekLabel,
}: {
  brand: RestaurantBrand;
  weekLabel: string;
}) {
  return (
    <>
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
    </>
  );
}
