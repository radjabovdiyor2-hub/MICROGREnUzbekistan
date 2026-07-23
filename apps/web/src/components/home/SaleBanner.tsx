'use client';

import { useState, useEffect } from 'react';
import { Leaf } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion, AnimatePresence } from 'framer-motion';

export function SaleBanner() {
  const { t } = useLang();
  const [timeLeft, setTimeLeft] = useState({ hours: 23, minutes: 45, seconds: 12 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) { seconds = 59; minutes--; }
        if (minutes < 0) { minutes = 59; hours--; }
        if (hours < 0) { hours = 23; minutes = 59; seconds = 59; }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');

  const TimerBlock = ({ value, label, accent }: { value: string; label: string; accent?: boolean }) => (
    <div style={{
      textAlign: 'center', minWidth: '52px',
      background: 'rgba(255,255,255,0.08)', borderRadius: '10px',
      padding: '8px 10px', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: accent ? 'var(--brand-accent)' : '#FFFFFF', lineHeight: 1, fontVariantNumeric: 'tabular-nums', overflow: 'hidden' }}>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={value}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{ display: 'inline-block' }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </div>
      <div style={{
        fontSize: '0.65rem', opacity: 0.65, textTransform: 'uppercase',
        fontWeight: 600, marginTop: '4px', letterSpacing: '0.5px',
      }}>{label}</div>
    </div>
  );

  return (
    <section className="section" id="sale-section">
      <div className="container">
        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%)',
          backgroundSize: '200% 200%',
          animation: 'hero-gradient-shift 8s ease infinite',
          borderRadius: '20px',
          padding: '28px 32px',
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'space-between',
          gap: '20px', position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(5, 150, 105, 0.25)',
        }}>
          {/* Decorative elements */}
          <div style={{
            position: 'absolute', top: '-40%', right: '-10%',
            width: '250px', height: '250px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            animation: 'float-circle 8s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', bottom: '-30%', left: '20%',
            width: '120px', height: '120px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
          }} />

          {/* Content */}
          <div style={{ flex: 1, minWidth: '240px', position: 'relative', zIndex: 1 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-full)',
              padding: '5px 14px', fontSize: '0.7rem', fontWeight: 700,
              color: 'white', textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: '12px', backdropFilter: 'blur(4px)',
            }}>
              <Leaf size={12} /> {t('Yangilik', 'Новинка')}
            </div>
            <div style={{
              fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800,
              color: 'white', fontFamily: 'var(--font-display)',
              lineHeight: 1.1, letterSpacing: '-0.3px',
              textShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {t('Yangi hosil yetib keldi!', 'Прибыл свежий урожай!')}
            </div>
            <div style={{
              fontSize: '1rem', marginTop: '6px', color: 'rgba(255,255,255,0.9)',
              fontWeight: 500,
            }}>
              {t('Birinchi buyurtmangizga', 'На первый заказ')} <strong>20%</strong> {t('chegirma', 'скидка')}
            </div>
          </div>

          {/* Timer */}
          <div style={{
            display: 'flex', gap: '6px', alignItems: 'center',
            background: 'rgba(0,0,0,0.25)', padding: '14px 18px',
            borderRadius: '16px', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            position: 'relative', zIndex: 1,
          }}>
            <TimerBlock value={pad(timeLeft.hours)} label={t("Soat", "Час")} />
            <div style={{ color: 'white', fontSize: '1.4rem', fontWeight: 800, opacity: 0.5 }}>:</div>
            <TimerBlock value={pad(timeLeft.minutes)} label={t("Daqiqa", "Мин")} />
            <div style={{ color: 'white', fontSize: '1.4rem', fontWeight: 800, opacity: 0.5 }}>:</div>
            <TimerBlock value={pad(timeLeft.seconds)} label={t("Soniya", "Сек")} accent />
          </div>
        </div>
      </div>
    </section>
  );
}
