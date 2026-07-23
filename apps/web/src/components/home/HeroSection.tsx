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
      minHeight: 'min(72vh, 680px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      overflow: 'hidden',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      paddingBottom: 'clamp(24px, 5vh, 50px)',
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
        style={{ position: 'relative', zIndex: 2, width: '100%' }}
        initial={prefersReduced ? 'visible' : 'hidden'}
        animate="visible"
        variants={stagger}
      >
        {/* Eyebrow */}
        <motion.div variants={rise} transition={spring} style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--brand-primary-hover)', marginBottom: '14px',
        }}>
          <span style={{ width: 26, height: 1, background: 'var(--brand-primary)' }} /> {t('hero.badge')}
        </motion.div>

        {/* Editorial headline */}
        <motion.h1 variants={rise} transition={spring} style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.0,
          margin: '0 0 0.5rem', fontSize: 'clamp(2.2rem, 6vw, 4.2rem)', textWrap: 'balance',
          maxWidth: '16ch', color: 'var(--text-primary)',
        }}>
          {t('hero.title1')}<br />
          <span style={{ color: 'var(--brand-primary)' }}>{t('hero.title2')}</span>
        </motion.h1>

        {/* Animated gold accent bar */}
        <motion.div
          variants={{
            hidden: { scaleX: 0, originX: 0 },
            visible: { scaleX: 1, originX: 0 },
          }}
          transition={{ ...spring, delay: 0.4 }}
          style={{
            height: 5, width: 104, borderRadius: 999,
            background: 'var(--brand-accent)', margin: '0 0 22px',
            transformOrigin: 'left',
          }}
        />

        <motion.p variants={rise} transition={spring} style={{
          maxWidth: '42ch', color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
          margin: '0 0 26px', lineHeight: 1.6,
        }}>
          {t('hero.subtitle')}
        </motion.p>

        <motion.div variants={rise} transition={spring} style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <Link href="/catalog" className="btn btn-primary btn-lg ripple btn-shimmer" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '15px 30px', borderRadius: '14px', fontWeight: 700,
            boxShadow: '0 12px 30px -10px rgba(var(--brand-primary-rgb), 0.5)',
          }}>
            {t('hero.catalog_btn')} <ArrowRight size={18} />
          </Link>
          <a href={CONTACT.phonePrimaryHref} className="btn btn-outline btn-lg" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '15px 30px', borderRadius: '14px',
          }}>
            <Phone size={18} /> {t('hero.contact_btn')}
          </a>
        </motion.div>

        {/* Trust indicators */}
        <motion.div variants={rise} transition={spring} style={{ marginTop: '32px', display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
          {[
            { icon: <Package size={16} />, text: t('hero.products_count'), c: 'var(--brand-primary)' },
            { icon: <Droplet size={16} />, text: t('hero.delivery'), c: 'var(--success)' },
            { icon: <Sparkles size={16} />, text: t('hero.prices'), c: 'var(--brand-accent)' },
          ].map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              <span style={{
                width: 30, height: 30, borderRadius: '9px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: it.c === 'var(--brand-primary)'
                  ? 'rgba(16,185,129,0.13)'
                  : it.c === 'var(--success)'
                    ? 'rgba(16,185,129,0.13)'
                    : 'rgba(255,184,0,0.15)',
                color: it.c,
              }}>{it.icon}</span>
              <span>{it.text}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
