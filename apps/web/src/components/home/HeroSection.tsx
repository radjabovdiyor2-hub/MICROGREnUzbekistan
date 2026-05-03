'use client';

import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';
import Image from 'next/image';

export function HeroSection() {
  const { t } = useLang();

  return (
    <section className="hero" id="hero-section" style={{
      background: 'var(--bg-secondary)',
      padding: '72px 0 56px',
      borderBottom: '1px solid var(--border)',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '500px',
    }}>
      {/* Animated background orbs */}
      <div style={{
        position: 'absolute', top: '-15%', right: '-8%',
        width: '45vw', height: '45vw', maxWidth: '500px', maxHeight: '500px',
        background: 'radial-gradient(circle, rgba(var(--brand-primary-rgb), 0.08) 0%, transparent 65%)',
        zIndex: 0, animation: 'float-orb 12s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-25%', left: '-8%',
        width: '35vw', height: '35vw', maxWidth: '350px', maxHeight: '350px',
        background: 'radial-gradient(circle, rgba(var(--brand-accent-rgb), 0.06) 0%, transparent 65%)',
        zIndex: 0, animation: 'float-orb 10s ease-in-out infinite reverse',
      }} />
      <div style={{
        position: 'absolute', top: '50%', left: '55%',
        width: '20vw', height: '20vw', maxWidth: '200px', maxHeight: '200px',
        background: 'radial-gradient(circle, rgba(var(--brand-primary-rgb), 0.04) 0%, transparent 60%)',
        zIndex: 0, animation: 'float-up-down 8s ease-in-out infinite',
      }} />

      <div className="container" style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '40px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 500px', maxWidth: '640px' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', padding: '7px 16px',
            background: 'var(--brand-primary-light)', color: 'var(--brand-primary)',
            borderRadius: 'var(--radius-full)', marginBottom: '24px',
            fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase',
            letterSpacing: '1px', alignItems: 'center', gap: '8px',
            border: '1px solid rgba(var(--brand-primary-rgb), 0.15)',
            boxShadow: '0 2px 12px rgba(var(--brand-primary-rgb), 0.1)',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--brand-primary)',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            {t('hero.badge')}
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 5.5vw, 3.4rem)',
            fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.08,
            marginBottom: '24px', letterSpacing: '-0.8px',
          }}>
            {t('hero.title1')}<br/>
            <span style={{
              background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 100%)',
              backgroundSize: '200% 200%',
              animation: 'hero-gradient-shift 6s ease infinite',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{t('hero.title2')}</span>
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: 'clamp(1rem, 2.2vw, 1.18rem)', color: 'var(--text-secondary)',
            marginBottom: '36px', lineHeight: 1.7, maxWidth: '500px',
          }}>
            {t('hero.subtitle')}
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <a href="/catalog" className="btn btn-primary" style={{
              padding: '15px 32px', fontSize: '1rem', borderRadius: '14px',
              boxShadow: '0 6px 20px rgba(var(--brand-primary-rgb), 0.35)',
              display: 'flex', alignItems: 'center', gap: '10px',
              fontWeight: 700,
            }}>
              {t('hero.catalog_btn')} <Icons.ArrowRight size={18} />
            </a>
            <a href="tel:+998997772232" className="btn btn-outline" style={{
              padding: '15px 32px', fontSize: '1rem', borderRadius: '14px',
              display: 'flex', alignItems: 'center', gap: '10px',
              backdropFilter: 'blur(8px)',
            }}>
              <Icons.Phone size={18} /> {t('hero.contact_btn')}
            </a>
          </div>

          {/* Trust indicators */}
          <div style={{
            marginTop: '36px', display: 'flex', alignItems: 'center', gap: '24px',
            flexWrap: 'wrap',
          }}>
            {[
              { icon: <Icons.Package size={16} />, text: t('hero.products_count'), color: 'var(--brand-primary)' },
              { icon: <Icons.Droplet size={16} />, text: t('hero.delivery'), color: 'var(--success)' },
              { icon: <Icons.Sparkles size={16} />, text: t('hero.prices'), color: 'var(--brand-accent)' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '10px',
                  background: `${item.color}15`, color: item.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero Image Block */}
        <div style={{
          flex: '1 1 400px', position: 'relative',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          perspective: '1000px',
        }}>
          <div style={{
            position: 'relative', width: '100%', maxWidth: '500px', aspectRatio: '4/3',
            borderRadius: '24px', overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 40px rgba(var(--brand-primary-rgb), 0.2)',
            transform: 'rotateY(-5deg) rotateX(5deg)',
            transition: 'transform 0.5s ease',
            border: '2px solid rgba(255,255,255,0.1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotateY(0deg) rotateX(0deg) scale(1.02)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'rotateY(-5deg) rotateX(5deg) scale(1)'; }}
          >
            <Image 
              src="/hero-microgreens.png" 
              alt="Fresh Microgreens Farm" 
              fill 
              style={{ objectFit: 'cover' }}
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            {/* Glossy overlay */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
              pointerEvents: 'none',
            }} />
          </div>
          
          {/* Floating mini badge */}
          <div style={{
            position: 'absolute', bottom: '10%', right: '5%',
            background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
            padding: '12px 20px', borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', gap: '12px',
            animation: 'float-up-down 4s ease-in-out infinite',
            zIndex: 2,
          }}>
            <div style={{ background: 'var(--success)', padding: '8px', borderRadius: '50%', color: 'white' }}>
              <Icons.Leaf size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>100% Organik</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Kichik fermalardan</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
