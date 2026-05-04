'use client';

import * as Icons from '@/components/ui/Icons';
import { useEffect, useState } from 'react';
import { useLang } from '@/components/providers/LangProvider';

export default function NotFound() {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      <div style={{
        position: 'absolute', top: '50%', right: '30%',
        width: '60px', height: '60px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
        animation: 'float-up-down 6s ease-in-out infinite',
      }} />

      {/* Animated Leaf Icon */}
      <div style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.5)',
        transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        marginBottom: '24px',
        position: 'relative',
      }}>
        <div style={{
          width: '120px', height: '120px', borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.1), rgba(var(--brand-accent-rgb), 0.05))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'float-up-down 4s ease-in-out infinite',
          border: '2px solid rgba(var(--brand-primary-rgb), 0.1)',
        }}>
          <Icons.Leaf size={56} style={{ color: 'var(--brand-primary)', opacity: 0.6 }} />
        </div>
        {/* Animated ring */}
        <div style={{
          position: 'absolute', inset: '-8px', borderRadius: '50%',
          border: '2px dashed rgba(var(--brand-primary-rgb), 0.15)',
          animation: 'spin-slow 20s linear infinite',
        }} />
      </div>

      {/* 404 number with gradient */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(5rem, 15vw, 10rem)',
        fontWeight: 800,
        lineHeight: 1,
        background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 50%, #8B5CF6 100%)',
        backgroundSize: '200% 200%',
        animation: 'hero-gradient-shift 4s ease infinite',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s',
        marginBottom: '8px',
        letterSpacing: '-4px',
      }}>
        404
      </h1>

      {/* Subtitle */}
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: 'clamp(1rem, 3vw, 1.3rem)',
        textAlign: 'center',
        marginBottom: '8px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(15px)',
        transition: 'all 0.6s ease 0.2s',
        fontWeight: 500,
      }}>
        {t("Bu sahifa topilmadi", "Эта страница не найдена")}
      </p>
      <p style={{
        color: 'var(--text-muted)',
        fontSize: 'var(--text-sm)',
        textAlign: 'center',
        marginBottom: '36px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(15px)',
        transition: 'all 0.6s ease 0.25s',
        maxWidth: '400px',
      }}>
        {t("Siz qidirayotgan sahifa o'chirilgan, nomi o'zgartirilgan yoki vaqtincha mavjud emas", "Страница, которую вы ищете, удалена, переименована или временно недоступна")}
      </p>

      {/* CTA Buttons */}
      <div style={{
        display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(15px)',
        transition: 'all 0.6s ease 0.35s',
      }}>
        <a href="/" className="btn btn-primary btn-magnetic ripple" style={{
          padding: '14px 32px', borderRadius: '14px', fontSize: '1rem',
          display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700,
          boxShadow: '0 6px 20px rgba(var(--brand-primary-rgb), 0.3)',
        }}>
          <Icons.Home size={20} /> {t("Bosh sahifa", "Главная")}
        </a>
        <a href="/catalog" className="btn btn-outline btn-magnetic" style={{
          padding: '14px 32px', borderRadius: '14px', fontSize: '1rem',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <Icons.Folder size={20} /> {t("Katalog", "Каталог")}
        </a>
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
