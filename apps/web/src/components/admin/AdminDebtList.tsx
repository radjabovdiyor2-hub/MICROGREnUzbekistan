'use client';

import React from 'react';
import { Banknote, CheckCircle, Clock } from 'lucide-react';

export interface Debt {
  id: string;
  type: 'WHO_OWES_US' | 'WE_OWE';
  personName: string;
  phone: string | null;
  amount: number;
  paidAmount: number;
  description: string | null;
  dueDate: string | null;
  isPaid: boolean;
  createdAt: string;
  supplier?: { name: string; phone: string | null } | null;
}

interface Props {
  debts: Debt[];
  loading: boolean;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
  isOverdue: (debt: Debt) => boolean;
  setPaymentModal: (debt: Debt | null) => void;
  setPaymentAmount: (val: string) => void;
}

export function AdminDebtList({
  debts, loading, fmt, fmtDate, isOverdue, setPaymentModal, setPaymentAmount,
}: Props) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
      </div>
    );
  }

  if (debts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <CheckCircle size={48} style={{ marginBottom: 'var(--space-2)', opacity: 0.3 }} />
        <p>Qarz topilmadi</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {debts.map(debt => {
        const remaining = debt.amount - debt.paidAmount;
        const progress = debt.amount > 0 ? (debt.paidAmount / debt.amount) * 100 : 0;
        const overdue = isOverdue(debt);

        return (
          <div key={debt.id} className="card" style={{
            padding: 'var(--space-4)',
            borderLeft: `3px solid ${debt.isPaid ? 'var(--success)' : overdue ? 'var(--error)' : 'var(--warning)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
                  <span style={{ fontWeight: 'var(--font-bold)' }}>{debt.personName}</span>
                  {overdue && <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: '10px', fontWeight: 'var(--font-bold)' }}>MUDDATI O&apos;TGAN</span>}
                  {debt.isPaid && <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: '10px', fontWeight: 'var(--font-bold)' }}>TO&apos;LANGAN</span>}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {debt.phone && `${debt.phone} · `}{debt.description && `${debt.description} · `}{fmtDate(debt.createdAt)}
                  {debt.dueDate && ` · Muddati: ${fmtDate(debt.dueDate)}`}
                </div>
                {!debt.isPaid && (
                  <div style={{ marginTop: 'var(--space-2)', height: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--success)', borderRadius: 'var(--radius-full)', transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', color: remaining > 0 ? 'var(--error)' : 'var(--success)' }}>
                  {fmt(remaining)} so&apos;m
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {fmt(debt.paidAmount)} / {fmt(debt.amount)}
                </div>
              </div>
              {!debt.isPaid && (
                <button onClick={() => { setPaymentModal(debt); setPaymentAmount(''); }} className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Banknote size={14} /> To&apos;lash
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
