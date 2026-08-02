'use client';

import { useState } from 'react';
import { CalendarClock, CheckCircle, Zap, ChevronDown } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { triggerHaptic } from '@/utils/haptic';

const INTERVALS = [
  { value: 'WEEKLY', labelRu: 'Каждую неделю', labelUz: 'Har hafta' },
  { value: 'BIWEEKLY', labelRu: 'Каждые 2 недели', labelUz: 'Har 2 hafta' },
  { value: 'MONTHLY', labelRu: 'Раз в месяц', labelUz: 'Oyda bir marta' },
] as const;

const DAYS = [
  { value: 0, labelRu: 'Понедельник', labelUz: 'Dushanba' },
  { value: 1, labelRu: 'Вторник', labelUz: 'Seshanba' },
  { value: 2, labelRu: 'Среда', labelUz: 'Chorshanba' },
  { value: 3, labelRu: 'Четверг', labelUz: 'Payshanba' },
  { value: 4, labelRu: 'Пятница', labelUz: 'Juma' },
  { value: 5, labelRu: 'Суббота', labelUz: 'Shanba' },
  { value: 6, labelRu: 'Воскресенье', labelUz: 'Yakshanba' },
] as const;

export type SubscriptionConfig = {
  interval: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  deliveryDay: number;
};

interface Props {
  active: boolean;
  onToggle: () => void;
  config: SubscriptionConfig;
  onConfigChange: (cfg: SubscriptionConfig) => void;
}

export function SmartSubscriptionWidget({ active, onToggle, config, onConfigChange }: Props) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);

  const toggleSub = () => {
    triggerHaptic('heavy');
    onToggle();
    if (!active) setExpanded(true);
  };

  const selectedInterval = INTERVALS.find(i => i.value === config.interval);
  const selectedDay = DAYS.find(d => d.value === config.deliveryDay);

  return (
    <div className="card" style={{
      padding: 'var(--space-4)',
      border: active ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
      background: active ? 'rgba(var(--brand-primary-rgb), 0.05)' : 'var(--card)',
      transition: 'all 0.3s ease',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden'
    }} onClick={toggleSub}>

      {active && (
        <div style={{ position: 'absolute', right: -20, top: -20, background: 'var(--brand-primary)', color: 'white', padding: '20px', borderRadius: '50%' }}>
          <CheckCircle size={24} style={{ position: 'relative', top: 5, right: 5 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div style={{ background: 'var(--brand-primary)', padding: '10px', borderRadius: '12px', color: 'white', flexShrink: 0 }}>
          <CalendarClock size={24} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {t("Aqlli obuna «Yashil Quti»", "Умная подписка «Зелёная Коробка»")}
          </h3>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {t(
              "Bu mahsulotlarni avtomatik yetkazish. To'lov yetkazishdan oldin olinadi.",
              "Доставлять эти товары автоматически. Оплата списывается перед доставкой."
            )}
          </p>
        </div>
      </div>

      {active && (
        <div onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
          <div
            style={{
              marginTop: '15px',
              padding: '12px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
            }}
          >
            <div
              onClick={() => setExpanded(!expanded)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer', color: 'var(--brand-primary)', fontWeight: 600,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={14} />
                {t(
                  `${selectedInterval?.labelUz}, ${selectedDay?.labelUz}`,
                  `${selectedInterval?.labelRu}, ${selectedDay?.labelRu}`
                )}
              </span>
              <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>

            {expanded && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    {t("Qancha tez-tez", "Как часто")}
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {INTERVALS.map(iv => (
                      <button
                        key={iv.value}
                        className="btn btn-sm"
                        onClick={() => onConfigChange({ ...config, interval: iv.value })}
                        style={{
                          background: config.interval === iv.value ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                          color: config.interval === iv.value ? 'white' : 'var(--text-secondary)',
                          border: 'none', fontSize: '12px', padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        {t(iv.labelUz, iv.labelRu)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    {t("Yetkazish kuni", "День доставки")}
                  </label>
                  <select
                    value={config.deliveryDay}
                    onChange={e => onConfigChange({ ...config, deliveryDay: Number(e.target.value) })}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)',
                      fontSize: '13px',
                    }}
                  >
                    {DAYS.map(d => (
                      <option key={d.value} value={d.value}>{t(d.labelUz, d.labelRu)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
