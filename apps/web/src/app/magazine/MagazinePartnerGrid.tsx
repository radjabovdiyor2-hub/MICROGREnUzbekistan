import React from 'react';
import type { listUploadedMagazines } from '@/lib/magazine/data';

type UploadedItem = Awaited<ReturnType<typeof listUploadedMagazines>>[number];

export function MagazinePartnerGrid({ uploaded }: { uploaded: UploadedItem[] }) {
  if (uploaded.length === 0) return null;

  return (
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
  );
}
