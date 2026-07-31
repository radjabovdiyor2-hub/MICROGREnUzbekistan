'use client';

import {
  Banknote, Calculator, Camera, ChevronRight, CloudSun, Gift, MessageCircle, Mic, Sparkles, User, Zap,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import Link from 'next/link';

export function AiBanner() {
  const { t } = useLang();

  const FEATURES = [
    { icon: <Calculator size={20} />, title: t('ai.calc'), desc: t('ai.calc_desc') },
    { icon: <Camera size={20} />, title: t('ai.photo'), desc: t('ai.photo_desc') },
    { icon: <CloudSun size={20} />, title: t('ai.weather'), desc: t('ai.weather_desc') },
    { icon: <Zap size={20} />, title: t('ai.electric'), desc: t('ai.electric_desc') },
    { icon: <Banknote size={20} />, title: t('ai.price'), desc: t('ai.price_desc') },
    { icon: <Gift size={20} />, title: t('ai.bonus'), desc: t('ai.bonus_desc') },
  ];

  const openChat = () => {
    const fab = document.getElementById('ai-chat-fab');
    if (fab) fab.click();
  };

  return (
    <section className="section" id="ai-section">
      <div className="container">
        {/* Main AI Banner */}
        <div style={{
          background: 'linear-gradient(135deg, var(--cat-1) 0%, var(--cat-9) 30%, var(--cat-9) 60%, #C084FC 100%)',
          backgroundSize: '300% 300%',
          animation: 'ai-gradient 10s ease infinite',
          borderRadius: '24px',
          padding: 'clamp(28px, 5vw, 40px) clamp(24px, 4vw, 36px)',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(99, 102, 241, 0.3)',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -70, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', animation: 'float-orb 10s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', animation: 'float-orb 8s ease-in-out infinite reverse' }} />
          <div style={{ position: 'absolute', top: '35%', right: '12%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', animation: 'float-up-down 6s ease-in-out infinite' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-full)',
              padding: '6px 16px', fontSize: '11px', fontWeight: 700,
              marginBottom: 'var(--space-4)', backdropFilter: 'blur(12px)',
              letterSpacing: '1px', textTransform: 'uppercase',
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
              <Sparkles size={13} /> AI Agronom
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 6vw, 36px)',
              fontWeight: 800,
              marginBottom: 'var(--space-2)',
              lineHeight: 1.1, letterSpacing: '-0.5px',
              textShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}>
              {t('ai.title')}
            </h2>
            <p style={{
              fontSize: 'var(--text-lg)', opacity: 0.92,
              marginBottom: 'var(--space-2)',
              fontWeight: 300, letterSpacing: '0.2px',
            }}>
              {t('ai.subtitle')}
            </p>

            <p style={{
              fontSize: 'var(--text-sm)', opacity: 0.72,
              marginBottom: 'var(--space-6)', lineHeight: 1.65,
              maxWidth: '380px',
            }}>
              {t('ai.desc')}
            </p>

            {/* CTA Buttons */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
              <button
                onClick={openChat}
                style={{
                  background: 'white', color: 'var(--cat-1)', border: 'none',
                  padding: '13px 26px',
                  fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                  transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)'; }}
              >
                <Sparkles size={16} /> {t('ai.try')}
              </button>
              <a
                href="https://t.me/Microgreenuzbekistan_bot"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(255,255,255,0.12)', color: 'white',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '13px 26px',
                  fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  textDecoration: 'none', backdropFilter: 'blur(8px)',
                  transition: 'all 0.2s',
                }}
              >
                <MessageCircle size={16} /> Telegram Bot
              </a>
            </div>

            {/* Stats */}
            <div style={{
              display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap',
              borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 'var(--space-4)',
            }}>
              {[
                { val: '6+', label: t('ai.stats.skills') },
                { val: '24/7', label: t('ai.stats.works') },
                { icon: <Camera size={18} />, label: t('ai.stats.photo') },
                { icon: <Mic size={18} />, label: t('ai.stats.voice') },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px',
                    textShadow: '0 1px 4px rgba(0,0,0,0.1)',
                  }}>
                    {s.val || s.icon}
                  </div>
                  <div style={{ fontSize: '10px', opacity: 0.55, marginTop: 3, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 'var(--space-3)', marginTop: 'var(--space-5)',
        }}>
          {FEATURES.map((f, i) => (
            <button
              key={i}
              onClick={openChat}
              style={{
                background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                borderRadius: '16px', padding: '20px 16px',
                textAlign: 'left', cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex', flexDirection: 'column', gap: '8px',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--brand-primary)';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(var(--brand-primary-rgb), 0.12)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{
                color: 'var(--brand-primary)',
                width: 40, height: 40, borderRadius: '12px',
                background: 'var(--brand-primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{f.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {f.title}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {f.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Referral Banner */}
        <div style={{
          marginTop: 'var(--space-5)',
          background: 'linear-gradient(135deg, var(--brand-primary-deep), var(--brand-primary-hover), var(--brand-primary))',
          backgroundSize: '200% 200%',
          animation: 'hero-gradient-shift 8s ease infinite',
          borderRadius: '20px',
          padding: '28px 32px',
          color: 'white', position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 28px rgba(5, 150, 105, 0.25)',
        }}>
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 100, height: 100, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            animation: 'float-up-down 6s ease-in-out infinite',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', position: 'relative', zIndex: 1 }}>
            <div style={{
              flexShrink: 0, width: 52, height: 52, borderRadius: '16px',
              background: 'rgba(255,255,255,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <Gift size={24} />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: 'var(--text-lg)', marginBottom: 3,
                textShadow: '0 1px 4px rgba(0,0,0,0.1)',
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
              marginTop: 'var(--space-4)', background: 'rgba(255,255,255,0.18)',
              padding: '10px 20px',
              color: 'white', textDecoration: 'none', fontSize: '13px', fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
              transition: 'all 0.2s',
              position: 'relative', zIndex: 1,
            }}
          >
            <User size={15} /> {t('ref.get_code')}
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
