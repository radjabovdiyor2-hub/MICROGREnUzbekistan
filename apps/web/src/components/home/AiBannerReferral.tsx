'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Gift, User } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';

export function AiBannerReferral() {
  const { t } = useLang();

  return (
    <div style={{
      marginTop: 'var(--space-5)',
      background: 'linear-gradient(135deg, var(--brand-primary-deep), var(--brand-primary-hover), var(--brand-primary))',
      backgroundSize: '200% 200%',
      animation: 'hero-gradient-shift 8s ease infinite',
      borderRadius: '20px',
      padding: '28px 32px',
      color: 'white', position: 'relative', overflow: 'hidden',
      boxShadow: '0 8px 28px rgba(var(--brand-primary-hover-rgb), 0.25)',
    }}>
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100, borderRadius: '50%',
        background: 'rgba(var(--overlay-light-rgb), 0.06)',
        animation: 'float-up-down 6s ease-in-out infinite',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', position: 'relative', zIndex: 1 }}>
        <div style={{
          flexShrink: 0, width: 52, height: 52, borderRadius: '16px',
          background: 'rgba(var(--overlay-light-rgb), 0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)', border: '1px solid rgba(var(--overlay-light-rgb), 0.1)',
        }}>
          <Gift size={24} />
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 'var(--text-lg)', marginBottom: 3,
            textShadow: '0 1px 4px rgba(var(--overlay-dark-rgb), 0.1)',
          }}>
            {t('ref.title')}
          </div>
          <div style={{ fontSize: 'var(--text-sm)', opacity: 0.9, lineHeight: 1.5 }}>
            {t('ref.desc')}
          </div>
        </div>
      </div>
      <Link
        href="/profile"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          marginTop: 'var(--space-4)', background: 'rgba(var(--overlay-light-rgb), 0.18)',
          padding: '10px 20px',
          color: 'white', textDecoration: 'none', fontSize: '13px', fontWeight: 700,
          border: '1px solid rgba(var(--overlay-light-rgb), 0.2)', backdropFilter: 'blur(4px)',
          transition: 'all 0.2s',
          position: 'relative', zIndex: 1,
        }}
      >
        <User size={15} /> {t('ref.get_code')}
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}
