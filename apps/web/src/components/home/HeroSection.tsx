'use client';

import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';
import { MicrogreensCanvas } from '@/components/ui/MicrogreensCanvas';
import { CONTACT } from '@/lib/site';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// "Grow" hero — editorial type over a generative microgreens field that
// sprouts on load and sways toward the pointer. No stock photo.
export function HeroSection() {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rise = (delay: number) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'none' : 'translateY(18px)',
    transition: `opacity .7s ${delay}s cubic-bezier(.16,1,.3,1), transform .7s ${delay}s cubic-bezier(.16,1,.3,1)`,
  });

  return (
    <section className="hero" id="hero-section" style={{
      position: 'relative',
      minHeight: 'min(88vh, 760px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      overflow: 'hidden',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      paddingBottom: 'clamp(28px, 6vh, 60px)',
    }}>
      {/* generative field */}
      <MicrogreensCanvas count={100} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '56%', zIndex: 0,
      }} />
      {/* ground the field + keep text legible */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to top, var(--bg-secondary) 16%, transparent 52%)',
      }} />

      <div className="container" style={{ position: 'relative', zIndex: 2, width: '100%' }}>
        {/* eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--brand-primary-hover)', marginBottom: '14px', ...rise(0),
        }}>
          <span style={{ width: 26, height: 1, background: 'var(--brand-primary)' }} /> {t('hero.badge')}
        </div>

        {/* editorial headline */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.0,
          margin: '0 0 0.5rem', fontSize: 'clamp(2.2rem, 6vw, 4.2rem)', textWrap: 'balance',
          maxWidth: '16ch', color: 'var(--text-primary)', ...rise(0.05),
        }}>
          {t('hero.title1')}<br />
          <span style={{ color: 'var(--brand-primary)' }}>{t('hero.title2')}</span>
        </h1>
        {/* animated gold accent bar */}
        <div style={{
          height: 5, width: 104, borderRadius: 999, background: 'var(--brand-accent)', margin: '0 0 22px',
          transformOrigin: 'left', transform: mounted ? 'scaleX(1)' : 'scaleX(0)',
          transition: 'transform .9s .5s cubic-bezier(.16,1,.3,1)',
        }} />

        <p style={{
          maxWidth: '42ch', color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
          margin: '0 0 26px', lineHeight: 1.6, ...rise(0.15),
        }}>
          {t('hero.subtitle')}
        </p>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', ...rise(0.22) }}>
          <Link href="/catalog" className="btn btn-primary btn-lg ripple" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '15px 30px', borderRadius: '14px', fontWeight: 700,
            boxShadow: '0 12px 30px -10px rgba(var(--brand-primary-rgb), 0.5)',
          }}>
            {t('hero.catalog_btn')} <Icons.ArrowRight size={18} />
          </Link>
          <a href={CONTACT.phonePrimaryHref} className="btn btn-outline btn-lg" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '15px 30px', borderRadius: '14px',
          }}>
            <Icons.Phone size={18} /> {t('hero.contact_btn')}
          </a>
        </div>

        {/* trust indicators */}
        <div style={{ marginTop: '32px', display: 'flex', gap: '22px', flexWrap: 'wrap', ...rise(0.32) }}>
          {[
            { icon: <Icons.Package size={16} />, text: t('hero.products_count'), c: 'var(--brand-primary)' },
            { icon: <Icons.Droplet size={16} />, text: t('hero.delivery'), c: 'var(--success)' },
            { icon: <Icons.Sparkles size={16} />, text: t('hero.prices'), c: 'var(--brand-accent)' },
          ].map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              <span style={{
                width: 30, height: 30, borderRadius: '9px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${it.c} 15%, transparent)`, color: it.c,
              }}>{it.icon}</span>
              <span>{it.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
