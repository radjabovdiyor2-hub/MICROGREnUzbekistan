'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Banknote, CheckCircle, Clock, Plus,
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

interface Summary {
  theyOweUs: number;
  weOwe: number;
  overdue: number;
  totalCount: number;
}

export function AdminDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<Summary>({ theyOweUs: 0, weOwe: 0, overdue: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'WHO_OWES_US' | 'WE_OWE'>('WHO_OWES_US');
  const [statusFilter, setStatusFilter] = useState('unpaid');
  const [showAdd, setShowAdd] = useState(false);
  const [paymentModal, setPaymentModal] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [newDebt, setNewDebt] = useState({ type: 'WHO_OWES_US', personName: '', phone: '', amount: '', description: '', dueDate: '' });

  const fetchDebts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/debts?type=${activeTab}&status=${statusFilter}`);
      const data = await res.json();
      setDebts(data.debts || []);
      setSummary(data.summary || { theyOweUs: 0, weOwe: 0, overdue: 0, totalCount: 0 });
    } catch (err) { console.error('Debts fetch error:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDebts(); }, [activeTab, statusFilter]);

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const isOverdue = (debt: Debt) => !debt.isPaid && debt.dueDate && new Date(debt.dueDate) < new Date();

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
          { label: "Muddati o'tgan", value: summary.overdue, color: '#F59E0B', icon: <AlertTriangle size={20} /> },
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

      {/* Add Debt Form */}
      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
            {activeTab === 'WHO_OWES_US' ? 'Yangi qarzdor' : 'Yangi qarz'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <input placeholder="Ism *" value={newDebt.personName} onChange={e => setNewDebt(p => ({ ...p, personName: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder="Telefon" value={newDebt.phone} onChange={e => setNewDebt(p => ({ ...p, phone: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input type="number" placeholder="Summa *" value={newDebt.amount} onChange={e => setNewDebt(p => ({ ...p, amount: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input type="date" value={newDebt.dueDate} onChange={e => setNewDebt(p => ({ ...p, dueDate: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder="Izoh" value={newDebt.description} onChange={e => setNewDebt(p => ({ ...p, description: e.target.value }))}
              style={{ gridColumn: '1/-1', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button onClick={handleAddDebt} className="btn btn-primary btn-sm">Saqlash</button>
            <button onClick={() => setShowAdd(false)} className="btn btn-ghost btn-sm">Bekor</button>
          </div>
        </div>
      )}

      {/* Debts List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        </div>
      ) : debts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <CheckCircle size={48} style={{ marginBottom: 'var(--space-2)', opacity: 0.3 }} />
          <p>Qarz topilmadi</p>
        </div>
      ) : (
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
                    {/* Progress bar */}
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
      )}

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
