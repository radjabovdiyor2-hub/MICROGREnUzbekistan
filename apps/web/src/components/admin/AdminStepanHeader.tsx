'use client';

import { Brain } from 'lucide-react';

export const STEPAN_SUGGESTIONS = [
  'Как дела с продажами сегодня?',
  'Что заканчивается на складе?',
  'Все ли боты живы?',
  'Покажи прибыль за месяц',
  'Сколько потратили на ИИ?',
];

export function AdminStepanHeader({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-5)',
        borderRadius: '18px',
        borderTop: '3px solid var(--brand-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            flexShrink: 0,
            background: 'var(--brand-primary-light)',
            color: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Brain size={22} />
        </div>
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-bold)',
              fontSize: 'var(--text-lg)',
            }}
          >
            {t('Стёпан — операционный директор', 'Stepan — operatsion direktor')}
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {t(
              'Видит заказы, склад, финансы и ботов. Действия выполняет только после вашего подтверждения.',
              "Buyurtma, ombor, moliya va botlarni ko'radi. Amallarni faqat tasdiqlaganingizdan keyin bajaradi.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
