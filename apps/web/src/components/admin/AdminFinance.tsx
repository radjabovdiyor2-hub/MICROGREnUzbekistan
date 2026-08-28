'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash } from 'lucide-react';

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

import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import { AdminFinanceForm } from './AdminFinanceForm';
import { AdminFinanceSummary } from './AdminFinanceSummary';

export function AdminFinance({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const notify = useFeedback();
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const queryClient = useQueryClient();
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin-finance', days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance?days=${days}`, { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') return data;
      throw new Error(data.error || t('Не удалось загрузить', "Yuklab bo'lmadi"));
    }
  });

  const entries: Entry[] = data?.entries || [];
  const summary: Summary | null = data?.summary || null;
  const byCategory: { type: string; category: string; total: number }[] = data?.byCategory || [];

  const load = async () => queryClient.invalidateQueries({ queryKey: ['admin-finance'] });

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

  /**
   * Удаление операции. Спрашиваем ОБЯЗАТЕЛЬНО и с суммой в вопросе.
   *
   * Кнопка — иконка в 14 пикселей без подписи, соседствующая со строкой
   * дохода. Промах пальцем стирал денежную запись молча и мгновенно, а
   * пересчитанная прибыль выглядела просто другой цифрой: ни следа, ни
   * возможности вернуть. Остальные четырнадцать путей удаления в админке
   * подтверждение спрашивают — этот был исключением.
   */
  const remove = async (entry: Entry) => {
    const what = `${entry.category}${entry.description ? ` — ${entry.description}` : ''}`;
    const sum = `${entry.type === 'income' ? '+' : '−'}${money(entry.amount)}`;
    const ok = await notify.confirm({
      title: t(`Удалить операцию «${what}» на ${sum}?`, `«${what}» (${sum}) o'chirilsinmi?`),
      detail: t(
        'Она исчезнет из отчёта за период, и прибыль пересчитается. Вернуть нельзя.',
        "U davr hisobotidan yo'qoladi va foyda qayta hisoblanadi. Qaytarib bo'lmaydi.",
      ),
      confirmText: t('Удалить', "O'chirish"),
      danger: true,
    });
    if (!ok) return;

    notify.undoable({
      text: t('Удаляю запись…', 'Yozuv oʻchirilmoqda…'),
      undoneText: t('Отменено — запись на месте', 'Bekor qilindi'),
      run: () => void removeEntry(entry),
    });
  };

  /** Само удаление. Вынесено, чтобы отсчёт отмены обёртывал его целиком. */
  const removeEntry = async (entry: Entry) => {
    setError('');
    const res = await fetch(`/api/admin/finance?id=${entry.id}`, {
      method: 'DELETE', credentials: 'same-origin',
    });
    // Отказ сервера был не виден вовсе: запрос уходил, ответ никто не читал,
    // список перезагружался прежним — и человек считал, что удалил.
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || t('Не удалось удалить', "O'chirib bo'lmadi"));
    }
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

      <AdminNotice>{error}</AdminNotice>

      {summary && <AdminFinanceSummary summary={summary} byCategory={byCategory} t={t} />}

      {showForm && (
        <AdminFinanceForm
          add={add} type={type} setType={setType} amount={amount} setAmount={setAmount}
          category={category} setCategory={setCategory} date={date} setDate={setDate}
          description={description} setDescription={setDescription} t={t} inputStyle={inputStyle}
        />
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
            <button onClick={() => remove(e)} title={t('Удалить', "O'chirish")}
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
