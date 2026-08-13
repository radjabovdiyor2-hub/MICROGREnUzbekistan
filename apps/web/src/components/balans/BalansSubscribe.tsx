'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { SmartSubscriptionWidget, type SubscriptionConfig } from '@/components/shop/SmartSubscriptionWidget';
import { BalansPlanCards } from './BalansPlanCards';
import { SUBSCRIPTION_PLANS, applyPlanDiscount } from '@/lib/subscriptions/plans';
import { inputStyle } from '@/components/home/nutritionistTypes';

export interface BalansProduct {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  unit: string | null;
}

// Оформление подписки BALANS. Это первая и единственная дверь в подписку на
// витрине: в корзине виджет был убран, потому что исполнения не существовало.
// Теперь исполнение есть (api/admin/subscriptions/run), и дверь нужна.
export function BalansSubscribe({ products }: { products: BalansProduct[] }) {
  const { lang, t } = useLang();
  const [plan, setPlan] = useState('balans-mini');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [config, setConfig] = useState<SubscriptionConfig>({ interval: 'WEEKLY', deliveryDay: 1 });
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');

  const items = useMemo(
    () => Object.entries(qty).filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity })),
    [qty],
  );
  const packs = items.reduce((sum, i) => sum + i.quantity, 0);
  const raw = items.reduce(
    (sum, i) => sum + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.quantity,
    0,
  );
  const perDelivery = applyPlanDiscount(raw, plan);
  const recommended = SUBSCRIPTION_PLANS[plan].packsPerDelivery;

  const bump = (id: string, delta: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));

  async function submit() {
    setError('');
    if (!items.length) return setError(t("Kamida bitta qadoq tanlang", 'Выберите хотя бы одну упаковку'));
    if (address.trim().length < 2) return setError(t('Manzilni kiriting', 'Укажите адрес'));
    if (phone.trim().length < 5) return setError(t('Telefonni kiriting', 'Укажите телефон'));

    setState('sending');
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, planCode: plan, address, phone, items }),
      });
      if (res.status === 401) {
        setState('idle');
        return setError(t('Avval profilga kiring', 'Сначала войдите в профиль'));
      }
      if (!res.ok) {
        setState('idle');
        return setError(t('Obuna rasmiylashtirilmadi', 'Не удалось оформить подписку'));
      }
      setState('done');
    } catch {
      setState('idle');
      setError(t('Tarmoq xatosi', 'Ошибка сети'));
    }
  }

  if (state === 'done') {
    return (
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <h3 style={{ marginBottom: 8 }}>{t('Obuna faollashtirildi', 'Подписка оформлена')}</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t(
            "Birinchi yetkazib berish tanlangan kunda bo'ladi. Obunani profilda to'xtatish yoki bekor qilish mumkin.",
            'Первая доставка — в выбранный день. Приостановить или отменить подписку можно в профиле.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <BalansPlanCards selected={plan} onSelect={setPlan} />

      <div>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
          {t("Qutini yig'ing", 'Соберите коробку')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {products.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-primary)',
            }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{lang === 'ru' ? p.nameRu : p.nameUz}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                {p.price.toLocaleString('ru-RU')} {t("so'm", 'сум')}{p.unit ? ` / ${p.unit}` : ''}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => bump(p.id, -1)} aria-label="минус">
                <Minus size={14} />
              </button>
              <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{qty[p.id] ?? 0}</span>
              <button type="button" className="btn btn-sm" onClick={() => bump(p.id, 1)} aria-label="плюс">
                <Plus size={14} />
              </button>
            </div>
          ))}
        </div>
        {packs > 0 && packs !== recommended && (
          <p style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {t(
              `Bu tarif uchun tavsiya — ${recommended} qadoq, siz ${packs} tanladingiz.`,
              `Для этого тарифа рекомендуем ${recommended} упаковки, выбрано ${packs}.`,
            )}
          </p>
        )}
      </div>

      <SmartSubscriptionWidget active config={config} onConfigChange={setConfig} />

      <input style={inputStyle} placeholder={t('Manzil', 'Адрес доставки')} value={address} onChange={(e) => setAddress(e.target.value)} />
      <input style={inputStyle} placeholder={t('Telefon', 'Телефон')} value={phone} onChange={(e) => setPhone(e.target.value)} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>
          {perDelivery.toLocaleString('ru-RU')} {t("so'm", 'сум')}
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {' '}/ {t('yetkazib berish', 'доставка')}
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={state === 'sending'}>
          {state === 'sending' ? t('Yuborilmoqda…', 'Отправляем…') : t('Obuna bo\'lish', 'Оформить подписку')}
        </button>
      </div>

      {error && <p style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</p>}
    </div>
  );
}
