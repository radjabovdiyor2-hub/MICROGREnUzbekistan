'use client';

import { ArrowRight, Phone, Package, Droplet, Sparkles } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { MicrogreensCanvas } from '@/components/ui/MicrogreensCanvas';
import { FloatingGreenery } from '@/components/ui/FloatingGreenery';
import { CONTACT } from '@/lib/site';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const rise = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export function HeroSection() {
  const { t } = useLang();
  const prefersReduced = useReducedMotion();

  return (
    <section className="hero" id="hero-section" style={{
      position: 'relative',
      minHeight: 'min(76vh, 660px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      overflow: 'hidden',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      paddingTop: 'var(--space-8)',
      paddingBottom: 'clamp(28px, 5vh, 52px)',
      textAlign: 'center',
    }}>
      {/* Ambient floating greenery */}
      <FloatingGreenery count={22} style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        width: '100%', height: '100%', zIndex: 0,
      }} />
      {/* Generative field at the bottom */}
      <MicrogreensCanvas count={100} variant="mixed" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '42%', zIndex: 0,
      }} />
      {/* Ground gradient */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(to top, var(--bg-secondary) 28%, transparent 65%)',
      }} />

      <motion.div
        className="container"
        style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 920, marginInline: 'auto' }}
        initial={prefersReduced ? 'visible' : 'hidden'}
        animate="visible"
        variants={stagger}
      >
        {/* Eyebrow */}
        <motion.div variants={rise} transition={spring} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.01em',
          color: 'var(--brand-primary)', marginBottom: '16px',
        }}>
          {t('hero.badge')}
        </motion.div>

        {/* Oversized headline */}
        <motion.h1 variants={rise} transition={spring} style={{
          fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.05,
          margin: '0 auto 18px', fontSize: 'clamp(2.2rem, 6.2vw, 4rem)', textWrap: 'balance',
          maxWidth: '16ch', color: 'var(--text-primary)',
        }}>
          {t('hero.title1')}<br />
          <span style={{ color: 'var(--brand-primary)' }}>{t('hero.title2')}</span>
        </motion.h1>

        <motion.p variants={rise} transition={spring} style={{
          maxWidth: '46ch', marginInline: 'auto', marginBottom: '32px',
          color: 'var(--text-secondary)', fontSize: 'clamp(1.1rem, 2.2vw, 1.5rem)',
          lineHeight: 1.5, letterSpacing: '-0.01em',
        }}>
          {t('hero.subtitle')}
        </motion.p>

        {/* Pill CTAs — no inline radius so the global pill treatment applies */}
        <motion.div variants={rise} transition={spring} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <Link href="/catalog" className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px' }}>
            {t('hero.catalog_btn')} <ArrowRight size={18} />
          </Link>
          <a href={CONTACT.phonePrimaryHref} className="btn btn-ghost btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--brand-primary)' }}>
            <Phone size={18} /> {t('hero.contact_btn')}
          </a>
        </motion.div>

        {/* Trust indicators */}
        <motion.div variants={rise} transition={spring} style={{ marginTop: '36px', display: 'flex', gap: '28px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { icon: <Package size={16} />, text: t('hero.products_count') },
            { icon: <Droplet size={16} />, text: t('hero.delivery') },
            { icon: <Sparkles size={16} />, text: t('hero.prices') },
          ].map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                color: 'var(--brand-primary)',
              }}>{it.icon}</span>
              <span>{it.text}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
