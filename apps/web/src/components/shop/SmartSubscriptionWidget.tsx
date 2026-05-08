'use client';

import { useState } from 'react';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';
import { triggerHaptic } from '@/utils/haptic';

export function SmartSubscriptionWidget() {
  const { t } = useLang();
  const [active, setActive] = useState(false);

  const toggleSub = () => {
    triggerHaptic('heavy');
    setActive(!active);
  };

  return (
    <div className="card" style={{ 
      padding: 'var(--space-4)', 
      marginTop: 'var(--space-4)', 
      border: active ? '2px solid #10B981' : '1px solid var(--border)',
      background: active ? 'rgba(16, 185, 129, 0.05)' : 'var(--card)',
      transition: 'all 0.3s ease',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden'
    }} onClick={toggleSub}>
      
      {active && (
        <div style={{ position: 'absolute', right: -20, top: -20, background: '#10B981', color: 'white', padding: '20px', borderRadius: '50%' }}>
          <Icons.CheckCircle size={24} style={{ position: 'relative', top: 5, right: 5 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div style={{ background: '#10B981', padding: '10px', borderRadius: '12px', color: 'white' }}>
          <Icons.CalendarClock size={24} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Умная подписка «Зеленая Коробка»
          </h3>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Доставлять эти товары автоматически каждую неделю. Оплата списывается перед доставкой.
          </p>
        </div>
      </div>
      
      {active && (
        <div style={{ marginTop: '15px', padding: '10px', background: 'var(--bg)', borderRadius: '8px', fontSize: '13px', color: '#10B981', fontWeight: 600 }}>
          <Icons.Zap size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
          Активировано! Мы пришлем ссылку на оплату в Telegram за день до доставки.
        </div>
      )}
    </div>
  );
}
