'use client';

import type { Promo } from './adminPromoTypes';

import { AdminPromoForm } from './AdminPromoForm';
import { useCallback, useEffect, useState } from 'react';
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

  const [codes, setCodes] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState(10);
  const [minSubtotal, setMinSubtotal] = useState(0);
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/promo', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') setCodes(data.codes);
      else setError(data.error || t('Не удалось загрузить', "Yuklab bo'lmadi"));
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

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
