'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Trash, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Доходы, расходы и P&L.
//
// Таблица finances наполнялась ботом Finance с самого начала, но
// увидеть её в вебе было негде: всю финансовую картину владелец получал
// только сообщениями в Telegram.
//
// Считается по деловой дате операции (колонка date), а не по моменту
// внесения: расход, проведённый задним числом, иначе выпадал бы из
// месячного отчёта и завышал прибыль.
// ══════════════════════════════════════════════════════════════════════

interface Entry {
  id: number; type: 'income' | 'expense'; amount: number;
  category: string; description: string | null; date: string;
}

interface Summary { income: number; expense: number; profit: number; margin: number }

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

export function AdminFinance({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byCategory, setByCategory] = useState<Array<{ type: string; category: string; total: number }>>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finance?days=${days}`, { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') {
        setEntries(data.entries);
        setSummary(data.summary);
        setByCategory(data.byCategory);
      } else setError(data.error || t('Не удалось загрузить', "Yuklab bo'lmadi"));
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    } finally {
      setLoading(false);
    }
  }, [days, lang]);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/admin/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ type, amount: Number(amount), category, description, date }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('Ошибка', 'Xatolik')); return; }
      setAmount(''); setCategory(''); setDescription('');
      setShowForm(false);
      await load();
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/admin/finance?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
    await load();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {[7, 30, 90, 365].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-outline'}`}>
            {d === 365 ? t('год', 'yil') : `${d} ${t('дн', 'kun')}`}
          </button>
        ))}
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {t('Операция', 'Amaliyot')}
        </button>
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

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
          {[
            { label: t('Доход', 'Daromad'), value: summary.income, color: 'var(--success)', icon: <TrendingUp size={18} /> },
            { label: t('Расход', 'Xarajat'), value: summary.expense, color: 'var(--error)', icon: <TrendingDown size={18} /> },
            {
              label: t('Прибыль', 'Foyda'), value: summary.profit,
              color: summary.profit >= 0 ? 'var(--brand-primary)' : 'var(--error)',
              icon: <Wallet size={18} />, extra: `${summary.margin}%`,
            },
          ].map(card => (
            <div key={card.label} className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: card.color, marginBottom: 6 }}>
                {card.icon}
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {card.label}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: card.color }}>
                {money(card.value)}
              </div>
              {card.extra && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {t('маржа', 'marja')}: {card.extra}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={add} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Тип', 'Tur')}
              </label>
              <select value={type} onChange={e => setType(e.target.value as 'income' | 'expense')} style={inputStyle}>
                <option value="expense">{t('Расход', 'Xarajat')}</option>
                <option value="income">{t('Доход', 'Daromad')}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Сумма', 'Summa')}
              </label>
              <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
                style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Статья', 'Modda')}
              </label>
              <input value={category} onChange={e => setCategory(e.target.value)}
                placeholder={t('семена, аренда, зарплата…', 'urug\', ijara…')} style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Дата операции', 'Amaliyot sanasi')}
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Комментарий', 'Izoh')}
              </label>
              <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
            {t('Добавить', "Qo'shish")}
          </button>
        </form>
      )}

      {byCategory.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
            {t('По статьям', 'Moddalar bo\'yicha')}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {byCategory.slice(0, 12).map(c => (
              <div key={`${c.type}:${c.category}`}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {c.category}
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                    {c.type === 'income' ? t('доход', 'daromad') : t('расход', 'xarajat')}
                  </span>
                </span>
                <b style={{ color: c.type === 'income' ? 'var(--success)' : 'var(--error)' }}>
                  {money(c.total)}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
            {t('Загрузка…', 'Yuklanmoqda…')}
          </div>
        ) : entries.map(e => (
          <div key={e.id} className="card" style={{
            padding: '10px 14px', borderRadius: 12, display: 'flex',
            alignItems: 'center', gap: 12, fontSize: 'var(--text-sm)',
          }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', minWidth: 84 }}>{e.date}</span>
            <span style={{ flex: 1 }}>
              <b>{e.category}</b>
              {e.description && <span style={{ color: 'var(--text-muted)' }}> — {e.description}</span>}
            </span>
            <b style={{ color: e.type === 'income' ? 'var(--success)' : 'var(--error)' }}>
              {e.type === 'income' ? '+' : '−'}{money(e.amount)}
            </b>
            <button onClick={() => remove(e.id)} title={t('Удалить', "O'chirish")}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <Trash size={14} />
            </button>
          </div>
        ))}

        {!loading && !entries.length && (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            {t('Операций за период нет', 'Bu davrda amaliyotlar yo\'q')}
          </div>
        )}
      </div>
    </div>
  );
}
