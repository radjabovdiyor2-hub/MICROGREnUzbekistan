'use client';

import React from 'react';
import { MapPin, Phone, Truck } from 'lucide-react';

export function ProductDeliveryTab({
  t,
}: {
  t: (uz: string, ru: string) => string;
}) {
  return (
    <div className="card" style={{ padding: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {[
          {
            icon: <Truck size={24} />,
            title: t('Yetkazib berish', 'Доставка'),
            sub: t('30-90 daqiqada · 25 000 so\'m (500K dan bepul)', 'За 30-90 минут · 25 000 сум (от 500К бесплатно)'),
          },
          {
            icon: <MapPin size={24} />,
            title: t("O'zingiz olib ketish", 'Самовывоз'),
            sub: t('Ray senter, Hokimiyat yonida', 'Райцентр, возле Хокимията'),
          },
          { icon: <Phone size={24} />, title: t('Maslahat', 'Консультация'), sub: '+998 94 999 95 99' },
        ].map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ color: 'var(--brand-primary)', flexShrink: 0 }}>{d.icon}</span>
            <div>
              <div style={{ fontWeight: 'var(--font-semibold)' }}>{d.title}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{d.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
