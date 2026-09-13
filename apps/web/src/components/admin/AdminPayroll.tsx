'use client';

import { useState } from 'react';

import { sumLabel } from '@/lib/units';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Trash2, Wallet } from 'lucide-react';

import { AdminNotice } from './AdminNotice';

// ══════════════════════════════════════════════════════════════════════
// Зарплата: кто сколько уже взял и сколько предстоит найти к выплате.
//
// ЗАЧЕМ ЭКРАН. Расход категории «зарплата» в финансах показывал, сколько
// ушло за месяц, но не отвечал на вопрос, который задают перед получкой:
// сколько из этого конкретный человек уже взял авансом. У расхода нет
// сотрудника — он связан только с заказом. Пока выплата не именная, аванс
// живёт в памяти владельца и в день выплаты всплывает недостачей.
//
// ПОЧЕМУ ОСТАТОК СЧИТАЕТСЯ БЕЗ ЗАЧЁТА ПЕРЕПЛАТ. Лишнее, выданное одному,
// не уменьшает того, что нужно отдать другому. Общая сумма «найти к
// выплате» складывает только положительные остатки — иначе в день выплаты
// обнаруживается нехватка ровно на размер чужой переплаты.
// ══════════════════════════════════════════════════════════════════════

type PayoutKind = 'ADVANCE' | 'SALARY' | 'BONUS' | 'DEDUCTION';

const KIND_LABEL: Record<PayoutKind, { ru: string; uz: string }> = {
  ADVANCE: { ru: 'Аванс', uz: 'Avans' },
  SALARY: { ru: 'Расчёт', uz: 'Hisob-kitob' },
  BONUS: { ru: 'Премия', uz: 'Mukofot' },
  DEDUCTION: { ru: 'Удержание', uz: 'Ushlab qolish' },
};

const KIND_HINT: Record<PayoutKind, { ru: string; uz: string }> = {
  ADVANCE: { ru: 'деньги выданы до дня выплаты', uz: "pul to'lov kunidan oldin berilgan" },
  SALARY: { ru: 'окончательный расчёт, деньги выданы', uz: 'yakuniy hisob-kitob, pul berilgan' },
  BONUS: { ru: 'начислена, денег не двигает', uz: "hisoblangan, pulni qo'zg'atmaydi" },
  DEDUCTION: { ru: 'уменьшает сумму к выплате', uz: "to'lanadigan summani kamaytiradi" },
};

interface PayrollRow {
  employeeId: string;
  name: string;
  isActive: boolean;
  base: number;
  bonuses: number;
  deductions: number;
  advances: number;
  settled: number;
  paidTotal: number;
  accrued: number;
  remaining: number;
  overpaid: boolean;
  /** Отработано дней за период. Ноль у тех, кто на окладе. */
  shiftDays: number;
  /** Ставка за смену. Ноль — считали по окладу. */
  shiftRate: number;
  /** Заданы и оклад, и ставка: ошибка ввода, а не режим работы. */
  rateConflict: boolean;
}

interface Payroll {
  period: string;
  payday: string;
  daysToPayday: number;
  rows: PayrollRow[];
  totalAccrued: number;
  totalPaid: number;
  totalRemaining: number;
}

interface Payout {
  id: string;
  employeeId: string;
  amount: number;
  kind: PayoutKind;
  paidAt: string;
  note: string | null;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

/** Сдвинуть период ГГГГ-ММ на n месяцев. */
function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const T = {
  loadFailed: { ru: 'Не удалось загрузить расчёт', uz: "Hisob-kitobni yuklab bo'lmadi" },
  employee: { ru: 'Сотрудник', uz: 'Xodim' },
  pickEmployee: { ru: 'Выберите сотрудника', uz: 'Xodimni tanlang' },
  amountPositive: { ru: 'Сумма должна быть больше нуля', uz: "Summa noldan katta bo'lishi kerak" },
  saveFailed: { ru: 'Не удалось сохранить', uz: "Saqlab bo'lmadi" },
  removeFailed: { ru: 'Не удалось удалить запись', uz: "Yozuvni o'chirib bo'lmadi" },
  loading: { ru: 'Загрузка…', uz: 'Yuklanmoqda…' },
  unavailable: { ru: 'Расчёт недоступен', uz: "Hisob-kitob mavjud emas" },
  inDays: { ru: 'через', uz: 'keyin' },
  days: { ru: 'дн.', uz: 'kun' },
  today: { ru: 'сегодня', uz: 'bugun' },
  overdue: { ru: 'просрочено на', uz: 'kechikdi' },
  payout: { ru: 'Выплата', uz: "To'lov" },
  accrued: { ru: 'Начислено', uz: 'Hisoblandi' },
  alreadyPaid: { ru: 'Уже выдано', uz: "Berib bo'lindi" },
  toFind: { ru: 'Найти к выплате', uz: "To'lovga topish" },
  employeeOption: { ru: '— сотрудник —', uz: '— xodim —' },
  dismissed: { ru: ' (уволен)', uz: " (ishdan bo'shatilgan)" },
  dismissedShort: { ru: ' · уволен', uz: " · ishdan bo'shatilgan" },
  amountPlaceholder: { ru: 'Сумма в сумах', uz: "Summa so'mda" },
  notePlaceholder: { ru: 'Заметка (необязательно)', uz: 'Izoh (majburiy emas)' },
  saving: { ru: 'Сохраняю…', uz: 'Saqlanmoqda…' },
  record: { ru: 'Записать', uz: "Yozib qo'yish" },
  tookBefore: { ru: 'Взял до выплаты', uz: "To'lovgacha oldi" },
  left: { ru: 'Осталось', uz: 'Qoldi' },
  shifts: { ru: 'смен', uz: 'smena' },
  bothRates: {
    ru: 'заданы и оклад, и ставка — считаем по окладу',
    uz: "ham oylik, ham stavka berilgan — oylik bo'yicha hisoblaymiz",
  },
  overpaid: { ru: 'переплата', uz: "ortiqcha to'langan" },
  nobody: { ru: 'За этот месяц никого нет', uz: "Bu oy uchun hech kim yo'q" },
  movements: { ru: 'Движения за период', uz: 'Davr harakatlari' },
  removeRecord: { ru: 'Удалить запись', uz: "Yozuvni o'chirish" },
};

export function AdminPayroll({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const [period, setPeriod] = useState(currentPeriod);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employeeId: '',
    amount: '',
    kind: 'ADVANCE' as PayoutKind,
    note: '',
  });

  const { data, isLoading, refetch } = useQuery<{ payroll: Payroll; payouts: Payout[] }>({
    queryKey: ['admin-payroll', period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payroll?period=${period}`);
      if (!res.ok) throw new Error(t('loadFailed'));
      return res.json();
    },
  });

  const payroll = data?.payroll;
  const payouts = data?.payouts ?? [];
  const nameOf = (id: string) =>
    payroll?.rows.find((r) => r.employeeId === id)?.name ?? t('employee');

  async function save() {
    setError(null);
    const amount = Number(form.amount.replace(/\s/g, ''));
    if (!form.employeeId) return setError(t('pickEmployee'));
    if (!Number.isFinite(amount) || amount <= 0) return setError(t('amountPositive'));

    setSaving(true);
    try {
      const res = await fetch('/api/admin/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: form.employeeId,
          amount: Math.round(amount),
          kind: form.kind,
          period,
          note: form.note.trim() || undefined,
        }),
      });
      // Отказ обязан быть виден: молчаливая неудача здесь означает, что
      // владелец считает аванс выданным, а система о нём не знает.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t('saveFailed'));
      }
      setForm({ employeeId: '', amount: '', kind: 'ADVANCE', note: '' });
      setShowAdd(false);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('removeFailed'));
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('removeFailed'));
    }
  }

  if (isLoading) return <div style={{ padding: 'var(--space-4)' }}>{t('loading')}</div>;
  if (!payroll) return <AdminNotice tone="error">{t('unavailable')}</AdminNotice>;

  const dueLabel =
    payroll.daysToPayday > 0
      ? `${t('inDays')} ${payroll.daysToPayday} ${t('days')}`
      : payroll.daysToPayday === 0
        ? t('today')
        : `${t('overdue')} ${-payroll.daysToPayday} ${t('days')}`;

  return (
    <div>
      {/* Период */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-ghost" onClick={() => setPeriod(shiftPeriod(period, -1))}>←</button>
        <div style={{ fontWeight: 'var(--font-bold)', minWidth: 90, textAlign: 'center' }}>{period}</div>
        <button className="btn btn-ghost" onClick={() => setPeriod(shiftPeriod(period, 1))}>→</button>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd((v) => !v)}>
          <Plus size={16} /> {t('payout')}
        </button>
      </div>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {/* Итоги */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {[
          { label: t('accrued'), value: `${fmt(payroll.totalAccrued)} ${sumLabel(lang)}`, color: 'var(--text-primary)', icon: <Wallet size={20} /> },
          { label: t('alreadyPaid'), value: `${fmt(payroll.totalPaid)} ${sumLabel(lang)}`, color: 'var(--warning)', icon: <Wallet size={20} /> },
          { label: t('toFind'), value: `${fmt(payroll.totalRemaining)} ${sumLabel(lang)}`, color: 'var(--error)', icon: <Wallet size={20} /> },
          { label: `${t('payout')} ${payroll.payday}`, value: dueLabel, color: 'var(--brand-primary)', icon: <CalendarClock size={20} /> },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: s.color }}>{s.icon}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>{s.label}</div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Форма выплаты */}
      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
          <select
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            style={{ padding: 'var(--space-2)' }}
          >
            <option value="">{t('employeeOption')}</option>
            {payroll.rows.map((r) => (
              <option key={r.employeeId} value={r.employeeId}>
                {r.name}
                {r.isActive ? '' : t('dismissed')}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {(Object.keys(KIND_LABEL) as PayoutKind[]).map((k) => (
              <button
                key={k}
                className={form.kind === k ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => setForm({ ...form, kind: k })}
                title={KIND_HINT[k][lang]}
              >
                {KIND_LABEL[k][lang]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{KIND_HINT[form.kind][lang]}</div>

          <input
            inputMode="numeric"
            placeholder={t('amountPlaceholder')}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            style={{ padding: 'var(--space-2)' }}
          />
          <input
            placeholder={t('notePlaceholder')}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ padding: 'var(--space-2)' }}
          />
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? t('saving') : t('record')}
          </button>
        </div>
      )}

      {/* По сотрудникам */}
      <div style={{ overflowX: 'auto', marginBottom: 'var(--space-4)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              <th style={{ padding: 'var(--space-2)' }}>{t('employee')}</th>
              <th style={{ padding: 'var(--space-2)' }}>{t('accrued')}</th>
              <th style={{ padding: 'var(--space-2)' }}>{t('tookBefore')}</th>
              <th style={{ padding: 'var(--space-2)' }}>{t('left')}</th>
            </tr>
          </thead>
          <tbody>
            {payroll.rows.map((r) => (
              <tr key={r.employeeId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2)' }}>
                  {r.name}
                  {!r.isActive && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{t('dismissedShort')}</span>
                  )}
                </td>
                <td style={{ padding: 'var(--space-2)' }}>
                  {fmt(r.accrued)}
                  {(r.bonuses > 0 || r.deductions > 0) && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                      {r.bonuses > 0 && ` +${fmt(r.bonuses)}`}
                      {r.deductions > 0 && ` −${fmt(r.deductions)}`}
                    </span>
                  )}
                  {/* ИЗ ЧЕГО ВЫШЛА СУММА. Раньше здесь стояло число без
                      объяснения, и проверить его было нечем — а это
                      деньги человека, и вопрос «почему столько» задают. */}
                  {r.shiftRate > 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                      {r.shiftDays} {t('shifts')} × {fmt(r.shiftRate)}
                    </div>
                  )}
                  {/* Заданы и оклад, и ставка. Расчёт взял оклад, но
                      молчать об этом нельзя: однажды он возьмёт не то. */}
                  {r.rateConflict && (
                    <div style={{ color: 'var(--error)', fontSize: 'var(--text-xs)' }}>
                      {t('bothRates')}
                    </div>
                  )}
                </td>
                <td style={{ padding: 'var(--space-2)', color: r.paidTotal > 0 ? 'var(--warning)' : undefined }}>
                  {fmt(r.paidTotal)}
                </td>
                <td
                  style={{
                    padding: 'var(--space-2)',
                    fontWeight: 'var(--font-bold)',
                    color: r.overpaid ? 'var(--error)' : 'var(--text-primary)',
                  }}
                >
                  {r.overpaid ? `${t('overpaid')} ${fmt(-r.remaining)}` : fmt(r.remaining)}
                </td>
              </tr>
            ))}
            {payroll.rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
                  {t('nobody')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Движения за период */}
      {payouts.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
            {t('movements')}
          </div>
          {payouts.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div>
                  {nameOf(p.employeeId)} · {KIND_LABEL[p.kind][lang]}
                </div>
                {p.note && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.note}</div>
                )}
              </div>
              <div style={{ fontWeight: 'var(--font-bold)' }}>{fmt(p.amount)}</div>
              <button className="btn btn-ghost" onClick={() => remove(p.id)} title={t('removeRecord')}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
