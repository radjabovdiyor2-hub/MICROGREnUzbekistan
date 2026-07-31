'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Percent, Plus, Tag, ToggleLeft, ToggleRight } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Промокоды.
//
// Модель и проверка кода при оформлении заказа были с самого начала, но
// интерфейса не существовало: создать код можно было только запросом в
// базу. Любая акция упиралась в разработчика.
// ══════════════════════════════════════════════════════════════════════

interface Promo {
  id: string; code: string; discountType: 'percent' | 'fixed'; value: number;
  minSubtotal: number; maxUses: number | null; usedCount: number;
  isActive: boolean; expiresAt: string | null; createdAt: string;
  exhausted: boolean; expired: boolean;
}

const money = (n: number) => `${n.toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

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
        <form onSubmit={create} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Код', 'Kod')}
              </label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="SUMMER25" style={inputStyle} required />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Тип скидки', 'Chegirma turi')}
              </label>
              <select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')}
                style={inputStyle}>
                <option value="percent">{t('Процент (%)', 'Foiz (%)')}</option>
                <option value="fixed">{t('Фиксированная (сум)', 'Belgilangan (so\'m)')}</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {discountType === 'percent' ? t('Скидка, %', 'Chegirma, %') : t('Скидка, сум', 'Chegirma, so\'m')}
              </label>
              <input type="number" min={1} max={discountType === 'percent' ? 100 : undefined}
                value={value} onChange={e => setValue(Number(e.target.value))} style={inputStyle} required />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Мин. сумма заказа', 'Min. buyurtma summasi')}
              </label>
              <input type="number" min={0} value={minSubtotal}
                onChange={e => setMinSubtotal(Number(e.target.value))} style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Лимит применений', 'Qo\'llash limiti')}
              </label>
              <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(e.target.value)}
                placeholder={t('без лимита', 'limitsiz')} style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Действует до', 'Amal qiladi')}
              </label>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
            {saving ? t('Создание…', 'Yaratilmoqda…') : t('Создать', 'Yaratish')}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
          {t('Загрузка…', 'Yuklanmoqda…')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {codes.map(p => {
            // Код может быть «активен», но не работать: исчерпан лимит или
            // вышел срок. Показываем настоящую причину, а не только флаг.
            const dead = !p.isActive || p.exhausted || p.expired;
            const reason = !p.isActive
              ? t('выключен', "o'chirilgan")
              : p.expired ? t('истёк', 'muddati tugagan')
              : p.exhausted ? t('лимит исчерпан', 'limit tugagan') : '';

            return (
              <div key={p.id} className="card" style={{
                padding: 'var(--space-4)', borderRadius: 14,
                display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap',
                opacity: dead ? 0.6 : 1,
                borderLeft: `3px solid ${dead ? 'var(--text-muted)' : 'var(--success)'}`,
              }}>
                <div style={{ minWidth: 130 }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-base)' }}>
                    {p.code}
                  </div>
                  {reason && (
                    <div style={{ fontSize: '11px', color: 'var(--warning)' }}>{reason}</div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--brand-primary)' }}>
                  {p.discountType === 'percent' ? <Percent size={15} /> : <Tag size={15} />}
                  {p.discountType === 'percent' ? `${p.value}%` : money(p.value)}
                </div>

                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flex: 1, minWidth: 160 }}>
                  {p.minSubtotal > 0 && <div>{t('от', 'dan')} {money(p.minSubtotal)}</div>}
                  <div>
                    {t('использован', 'ishlatilgan')}: {p.usedCount}
                    {p.maxUses != null ? ` / ${p.maxUses}` : ''}
                  </div>
                  {p.expiresAt && (
                    <div>{t('до', 'gacha')} {new Date(p.expiresAt).toLocaleDateString('ru-RU')}</div>
                  )}
                </div>

                <button onClick={() => toggle(p)}
                  title={p.isActive ? t('Выключить', "O'chirish") : t('Включить', 'Yoqish')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: p.isActive ? 'var(--success)' : 'var(--text-muted)',
                  }}>
                  {p.isActive ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                </button>
              </div>
            );
          })}

          {!codes.length && (
            <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Tag size={28} style={{ marginBottom: 8 }} />
              <div>{t('Промокодов пока нет', 'Hozircha promokodlar yo\'q')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
