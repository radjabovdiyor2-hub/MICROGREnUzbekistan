'use client';

import { useState } from 'react';
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

const KIND_RU: Record<PayoutKind, string> = {
  ADVANCE: 'Аванс',
  SALARY: 'Расчёт',
  BONUS: 'Премия',
  DEDUCTION: 'Удержание',
};

const KIND_HINT: Record<PayoutKind, string> = {
  ADVANCE: 'деньги выданы до дня выплаты',
  SALARY: 'окончательный расчёт, деньги выданы',
  BONUS: 'начислена, денег не двигает',
  DEDUCTION: 'уменьшает сумму к выплате',
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

export function AdminPayroll() {
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
      if (!res.ok) throw new Error('Не удалось загрузить расчёт');
      return res.json();
    },
  });

  const payroll = data?.payroll;
  const payouts = data?.payouts ?? [];
  const nameOf = (id: string) =>
    payroll?.rows.find((r) => r.employeeId === id)?.name ?? 'Сотрудник';

  async function save() {
    setError(null);
    const amount = Number(form.amount.replace(/\s/g, ''));
    if (!form.employeeId) return setError('Выберите сотрудника');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Сумма должна быть больше нуля');

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
        throw new Error(body.error ?? 'Не удалось сохранить');
      }
      setForm({ employeeId: '', amount: '', kind: 'ADVANCE', note: '' });
      setShowAdd(false);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Не удалось удалить запись');
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить запись');
    }
  }

  if (isLoading) return <div style={{ padding: 'var(--space-4)' }}>Загрузка…</div>;
  if (!payroll) return <AdminNotice tone="error">Расчёт недоступен</AdminNotice>;

  const dueLabel =
    payroll.daysToPayday > 0
      ? `через ${payroll.daysToPayday} дн.`
      : payroll.daysToPayday === 0
        ? 'сегодня'
        : `просрочено на ${-payroll.daysToPayday} дн.`;

  return (
    <div>
      {/* Период */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-ghost" onClick={() => setPeriod(shiftPeriod(period, -1))}>←</button>
        <div style={{ fontWeight: 'var(--font-bold)', minWidth: 90, textAlign: 'center' }}>{period}</div>
        <button className="btn btn-ghost" onClick={() => setPeriod(shiftPeriod(period, 1))}>→</button>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd((v) => !v)}>
          <Plus size={16} /> Выплата
        </button>
      </div>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {/* Итоги */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {[
          { label: 'Начислено', value: `${fmt(payroll.totalAccrued)} сум`, color: 'var(--text-primary)', icon: <Wallet size={20} /> },
          { label: 'Уже выдано', value: `${fmt(payroll.totalPaid)} сум`, color: 'var(--warning)', icon: <Wallet size={20} /> },
          { label: 'Найти к выплате', value: `${fmt(payroll.totalRemaining)} сум`, color: 'var(--error)', icon: <Wallet size={20} /> },
          { label: `Выплата ${payroll.payday}`, value: dueLabel, color: 'var(--brand-primary)', icon: <CalendarClock size={20} /> },
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
            <option value="">— сотрудник —</option>
            {payroll.rows.map((r) => (
              <option key={r.employeeId} value={r.employeeId}>
                {r.name}
                {r.isActive ? '' : ' (уволен)'}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {(Object.keys(KIND_RU) as PayoutKind[]).map((k) => (
              <button
                key={k}
                className={form.kind === k ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => setForm({ ...form, kind: k })}
                title={KIND_HINT[k]}
              >
                {KIND_RU[k]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{KIND_HINT[form.kind]}</div>

          <input
            inputMode="numeric"
            placeholder="Сумма в сумах"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            style={{ padding: 'var(--space-2)' }}
          />
          <input
            placeholder="Заметка (необязательно)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ padding: 'var(--space-2)' }}
          />
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохраняю…' : 'Записать'}
          </button>
        </div>
      )}

      {/* По сотрудникам */}
      <div style={{ overflowX: 'auto', marginBottom: 'var(--space-4)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              <th style={{ padding: 'var(--space-2)' }}>Сотрудник</th>
              <th style={{ padding: 'var(--space-2)' }}>Начислено</th>
              <th style={{ padding: 'var(--space-2)' }}>Взял до выплаты</th>
              <th style={{ padding: 'var(--space-2)' }}>Осталось</th>
            </tr>
          </thead>
          <tbody>
            {payroll.rows.map((r) => (
              <tr key={r.employeeId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2)' }}>
                  {r.name}
                  {!r.isActive && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}> · уволен</span>
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
                  {r.overpaid ? `переплата ${fmt(-r.remaining)}` : fmt(r.remaining)}
                </td>
              </tr>
            ))}
            {payroll.rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
                  За этот месяц никого нет
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
            Движения за период
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
                  {nameOf(p.employeeId)} · {KIND_RU[p.kind]}
                </div>
                {p.note && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.note}</div>
                )}
              </div>
              <div style={{ fontWeight: 'var(--font-bold)' }}>{fmt(p.amount)}</div>
              <button className="btn btn-ghost" onClick={() => remove(p.id)} title="Удалить запись">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
