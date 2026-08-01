'use client';

import type { Dispatch, SetStateAction } from 'react';

// Форма добавления долга. Показывается по флагу showAdd.

export interface DebtDraft {
  type: string;
  personName: string;
  phone: string;
  amount: string;
  description: string;
  dueDate: string;
}

interface Props {
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  activeTab: string;
  newDebt: DebtDraft;
  setNewDebt: Dispatch<SetStateAction<DebtDraft>>;
  handleAddDebt: () => void;
}

export function AdminDebtForm({ showAdd, setShowAdd, activeTab, newDebt, setNewDebt, handleAddDebt }: Props) {
  return (
    <>
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
    </>
  );
}
