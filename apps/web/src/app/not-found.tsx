'use client';

import { Folder, Home, Leaf } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion, useReducedMotion } from 'framer-motion';
import { LottieAnimation } from '@/components/ui/LottieAnimation';
import emptyState from '@/assets/lottie/empty-state.json';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const rise = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function NotFound() {
  const { t } = useLang();
  const prefersReduced = useReducedMotion();

  return (
    <div className="bg-mesh" style={{
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-8)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Floating orbs */}
      <div style={{
        position: 'absolute', top: '10%', left: '15%',
        width: '120px', height: '120px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(var(--brand-primary-rgb), 0.12) 0%, transparent 70%)',
        animation: 'float-orb 8s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', right: '10%',
        width: '180px', height: '180px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(var(--brand-accent-rgb), 0.08) 0%, transparent 70%)',
        animation: 'float-orb 12s ease-in-out infinite reverse',
      }} />

      <motion.div
        initial={prefersReduced ? 'visible' : 'hidden'}
        animate="visible"
        variants={stagger}
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', textAlign: 'center',
        }}
      >
        {/* Lottie empty-state animation */}
        <motion.div variants={rise} transition={spring}>
          <LottieAnimation
            animationData={emptyState}
            loop
            style={{ width: 160, height: 160, marginBottom: 8 }}
          />
        </motion.div>

        {/* 404 number with gradient */}
        <motion.h1 variants={rise} transition={spring} style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(5rem, 15vw, 10rem)',
          fontWeight: 800,
          lineHeight: 1,
          background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 50%, #8B5CF6 100%)',
          backgroundSize: '200% 200%',
          animation: 'hero-gradient-shift 4s ease infinite',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '8px',
          letterSpacing: '-4px',
        }}>
          404
        </motion.h1>

        {/* Subtitle */}
        <motion.p variants={rise} transition={spring} style={{
          color: 'var(--text-secondary)',
          fontSize: 'clamp(1rem, 3vw, 1.3rem)',
          marginBottom: '8px',
          fontWeight: 500,
        }}>
          {t("Bu sahifa topilmadi", "Эта страница не найдена")}
        </motion.p>
        <motion.p variants={rise} transition={spring} style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
          marginBottom: '36px',
          maxWidth: '400px',
        }}>
          {t("Siz qidirayotgan sahifa o'chirilgan, nomi o'zgartirilgan yoki vaqtincha mavjud emas", "Страница, которую вы ищете, удалена, переименована или временно недоступна")}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div variants={rise} transition={spring} style={{
          display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <motion.a
            href="/"
            className="btn btn-primary btn-magnetic ripple"
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            style={{
              padding: '14px 32px', borderRadius: '14px', fontSize: '1rem',
              display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700,
              boxShadow: '0 6px 20px rgba(var(--brand-primary-rgb), 0.3)',
            }}
          >
            <Home size={20} /> {t("Bosh sahifa", "Главная")}
          </motion.a>
          <motion.a
            href="/catalog"
            className="btn btn-outline btn-magnetic"
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            style={{
              padding: '14px 32px', borderRadius: '14px', fontSize: '1rem',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}
          >
            <Folder size={20} /> {t("Katalog", "Каталог")}
          </motion.a>
        </motion.div>
      </motion.div>
    </div>
  );
}
