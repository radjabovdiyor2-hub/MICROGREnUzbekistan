'use client';

import Image from 'next/image';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';
import { triggerHaptic } from '@/utils/haptic';

export function AiNutritionistBanner() {
  const { t } = useLang();

  const openBot = () => {
    triggerHaptic('heavy');
    // Assuming the bot link is microgreenuzbekistan_bot
    window.location.href = 'https://t.me/Microgreenuzbekistan_bot';
  };

  return (
    <div className="section container">
      <div 
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-2xl)',
          overflow: 'hidden',
          background: '#0F172A',
          boxShadow: '0 20px 40px rgba(16, 185, 129, 0.15)',
        }}
      >
        {/* Background Image */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
          <Image 
            src="/images/ai-nutritionist.png" 
            alt="AI Nutritionist" 
            fill 
            style={{ objectFit: 'cover' }} 
          />
          {/* Gradient Overlay for text readability */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #0F172A 30%, transparent)' }} />
        </div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '500px' }}>
          <div style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '8px', 
            background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', 
            padding: '6px 12px', borderRadius: 'var(--radius-full)', 
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
            width: 'fit-content', border: '1px solid rgba(52, 211, 153, 0.3)'
          }}>
            <Icons.Scan size={14} /> NEW: AI Nutritionist
          </div>

          <h2 style={{ 
            fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', 
            fontWeight: 'var(--font-extrabold)', color: 'white', lineHeight: 1.1 
          }}>
            Узнайте, чего не хватает вашему завтраку
          </h2>
          
          <p style={{ color: '#94A3B8', fontSize: 'var(--text-base)', lineHeight: 1.5 }}>
            Сфотографируйте свою еду и отправьте нашему ИИ-Боту. Нейросеть проанализирует блюдо и подскажет, какая микрозелень добавит недостающие витамины и сделает его в 2 раза полезнее!
          </p>

          <button 
            onClick={openBot}
            style={{
              background: 'linear-gradient(135deg, #10B981, #059669)',
              color: 'white',
              border: 'none',
              padding: '16px 24px',
              borderRadius: 'var(--radius-xl)',
              fontSize: 'var(--text-base)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              width: 'fit-content',
              marginTop: 'var(--space-2)',
              boxShadow: '0 10px 20px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Icons.Camera size={20} />
            Анализировать еду в Telegram
            <Icons.ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
