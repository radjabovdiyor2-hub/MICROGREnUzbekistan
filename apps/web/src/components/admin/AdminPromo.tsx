'use client';

import type { Promo } from './adminPromoTypes';

import { AdminPromoForm } from './AdminPromoForm';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Промокоды.
//
// Модель и проверка кода при оформлении заказа были с самого начала, но
// интерфейса не существовало: создать код можно было только запросом в
// базу. Любая акция упиралась в разработчика.
// ══════════════════════════════════════════════════════════════════════

import { AdminPromoList } from './AdminPromoList';

export function AdminPromo({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const queryClient = useQueryClient();

  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState(10);
  const [minSubtotal, setMinSubtotal] = useState(0);
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const { data: codes = [], isLoading: loading } = useQuery<Promo[]>({
    queryKey: ['admin-promo'],
    queryFn: async () => {
      const res = await fetch('/api/admin/promo', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') return data.codes;
      throw new Error(data.error || t('Не удалось загрузить', "Yuklab bo'lmadi"));
    }
  });

  const load = async () => queryClient.invalidateQueries({ queryKey: ['admin-promo'] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          code, discountType, value, minSubtotal,
          maxUses: maxUses === '' ? null : Number(maxUses),
          expiresAt: expiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('Не удалось создать', "Yaratib bo'lmadi"));
        return;
      }
      setCode(''); setValue(10); setMinSubtotal(0); setMaxUses(''); setExpiresAt('');
      setShowForm(false);
      await load();
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (promo: Promo) => {
    await fetch('/api/admin/promo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: promo.id, isActive: !promo.isActive }),
    });
    await load();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> {t('Новый промокод', 'Yangi promokod')}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {t(`Всего: ${codes.length}`, `Jami: ${codes.length}`)}
        </span>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, background: 'var(--error-bg)',
          color: 'var(--error)', fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {showForm && (
        <AdminPromoForm
          code={code}
          setCode={setCode}
          discountType={discountType}
          setDiscountType={setDiscountType}
          value={value}
          setValue={setValue}
          minSubtotal={minSubtotal}
          setMinSubtotal={setMinSubtotal}
          maxUses={maxUses}
          setMaxUses={setMaxUses}
          expiresAt={expiresAt}
          setExpiresAt={setExpiresAt}
          saving={saving}
          create={create}
          t={t}
          inputStyle={inputStyle}
        />
      )}

      <AdminPromoList codes={codes} loading={loading} t={t} toggle={toggle} />
    </div>
  );
}
