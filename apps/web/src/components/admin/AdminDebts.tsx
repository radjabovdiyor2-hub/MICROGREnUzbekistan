'use client';

import { AdminDebtForm } from './AdminDebtForm';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Banknote, Plus,
} from 'lucide-react';

interface Debt {
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



import { AdminDebtList } from './AdminDebtList';

export function AdminDebts() {
  const [activeTab, setActiveTab] = useState<'WHO_OWES_US' | 'WE_OWE'>('WHO_OWES_US');
  const [statusFilter, setStatusFilter] = useState('unpaid');
  const [showAdd, setShowAdd] = useState(false);
  const [paymentModal, setPaymentModal] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [newDebt, setNewDebt] = useState({ type: 'WHO_OWES_US', personName: '', phone: '', amount: '', description: '', dueDate: '' });

  const { data, isLoading: loading, refetch: fetchDebts } = useQuery({
    queryKey: ['admin-debts', activeTab, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/debts?type=${activeTab}&status=${statusFilter}`);
      const data = await res.json();
      return {
        debts: data.debts || [],
        summary: data.summary || { theyOweUs: 0, weOwe: 0, overdue: 0, totalCount: 0 }
      };
    }
  });

  const debts = data?.debts || [];
  const summary = data?.summary || { theyOweUs: 0, weOwe: 0, overdue: 0, totalCount: 0 };

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const isOverdue = (debt: Debt): boolean => Boolean(!debt.isPaid && debt.dueDate && new Date(debt.dueDate) < new Date());

  const handleAddDebt = async () => {
    if (!newDebt.personName || !newDebt.amount) return;
    try {
      await fetch('/api/inventory/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newDebt, amount: parseInt(newDebt.amount), type: activeTab }),
      });
      setShowAdd(false);
      setNewDebt({ type: 'WHO_OWES_US', personName: '', phone: '', amount: '', description: '', dueDate: '' });
      fetchDebts();
    } catch (err) { console.error('Add debt error:', err); }
  };

  const handlePayment = async () => {
    if (!paymentModal || !paymentAmount) return;
    try {
      await fetch('/api/inventory/debts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: paymentModal.id, payment: parseInt(paymentAmount) }),
      });
      setPaymentModal(null);
      setPaymentAmount('');
      fetchDebts();
    } catch (err) { console.error('Payment error:', err); }
  };

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {[
          { label: "Bizga qarzdor", value: `${fmt(summary.theyOweUs)} so'm`, color: 'var(--success)', icon: <ArrowRight size={20} /> },
          { label: "Biz qarzdormiz", value: `${fmt(summary.weOwe)} so'm`, color: 'var(--error)', icon: <ArrowLeft size={20} /> },
          { label: "Balans", value: `${fmt(summary.theyOweUs - summary.weOwe)} so'm`, color: 'var(--brand-primary)', icon: <Banknote size={20} /> },
          { label: "Muddati o'tgan", value: summary.overdue, color: 'var(--warning)', icon: <AlertTriangle size={20} /> },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: `${stat.color}15`, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{stat.label}</div>
              <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button onClick={() => setActiveTab('WHO_OWES_US')} className={`btn ${activeTab === 'WHO_OWES_US' ? 'btn-primary' : 'btn-ghost'}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowRight size={14} /> Bizga qarzdorlar
        </button>
        <button onClick={() => setActiveTab('WE_OWE')} className={`btn ${activeTab === 'WE_OWE' ? 'btn-primary' : 'btn-ghost'}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={14} /> Biz qarzdormiz
        </button>
        <div style={{ flex: 1 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
          <option value="all">Barchasi</option>
          <option value="unpaid">To&apos;lanmagan</option>
          <option value="overdue">Muddati o&apos;tgan</option>
          <option value="paid">To&apos;langan</option>
        </select>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> Qarz qo&apos;shish
        </button>
      </div>

      <AdminDebtForm
        showAdd={showAdd}
        setShowAdd={setShowAdd}
        activeTab={activeTab}
        newDebt={newDebt}
        setNewDebt={setNewDebt}
        handleAddDebt={handleAddDebt}
      />
      <AdminDebtList
        debts={debts}
        loading={loading}
        fmt={fmt}
        fmtDate={fmtDate}
        isOverdue={isOverdue}
        setPaymentModal={setPaymentModal}
        setPaymentAmount={setPaymentAmount}
      />

      {/* Payment Modal */}
      {paymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
          onClick={() => setPaymentModal(null)}>
          <div className="card" style={{ padding: 'var(--space-6)', maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
              To&apos;lov kiritish
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)' }}>{paymentModal.personName}</p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
              Qoldiq: {fmt(paymentModal.amount - paymentModal.paidAmount)} so&apos;m
            </p>
            <input type="number" placeholder="Summa" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
              style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }} />
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button onClick={() => setPaymentAmount(String(paymentModal.amount - paymentModal.paidAmount))} className="btn btn-ghost btn-sm">To&apos;liq</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => setPaymentModal(null)} className="btn btn-ghost btn-sm">Bekor</button>
              <button onClick={handlePayment} className="btn btn-primary btn-sm">Tasdiqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
