'use client';

import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { MicrogreensCanvas } from '@/components/ui/MicrogreensCanvas';

// Closing CTA before the footer: a scroll-linked generative field (sprouts +
// salad leaves grow as the visitor arrives) under a final "go to catalog" pitch.
export function GrowFieldCTA() {
  const { t } = useLang();

  return (
    <section style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)',
      padding: 'var(--space-12) 0 0',
    }}>
      <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em',
          fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', marginBottom: 'var(--space-3)', textWrap: 'balance',
        }}>
          {t("Bugun ekilgan — ertaga stolingizda", 'Свежесть с грядки — уже сегодня на вашем столе')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '46ch', margin: '0 auto var(--space-6)', lineHeight: 1.6 }}>
          {t(
            "Mikroko'katlar va salatlar buyurtma kunida kesiladi va 30–90 daqiqada yetkaziladi",
            'Микрозелень и салаты срезаем в день заказа и доставляем за 30–90 минут'
          )}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/catalog" className="btn btn-primary btn-lg ripple btn-shimmer" style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '15px 32px',
            borderRadius: '14px', fontWeight: 700,
            boxShadow: '0 12px 30px -10px rgba(var(--brand-primary-rgb), 0.5)',
          }}>
            <Leaf size={18} /> {t('Katalogni ochish', 'Открыть каталог')}
          </Link>
        </div>
      </div>

      {/* the field grows in as the section scrolls into view */}
      <MicrogreensCanvas count={110} variant="mixed" scrollLinked style={{
        display: 'block', width: '100%', height: 'clamp(120px, 22vh, 200px)',
        marginTop: 'var(--space-6)',
      }} />
    </section>
  );
}
