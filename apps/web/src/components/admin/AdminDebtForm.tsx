'use client';

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

// Форма добавления долга. Показывается по флагу showAdd.

export interface DebtDraft {
  type: string;
  personName: string;
  phone: string;
  amount: string;
  description: string;
  dueDate: string;
  /** Заполняется в закладке «мы должны»: связь долга с поставщиком. */
  supplierId: string;
}

interface Supplier { id: string; name: string; phone: string | null }

interface Props {
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  activeTab: string;
  newDebt: DebtDraft;
  setNewDebt: Dispatch<SetStateAction<DebtDraft>>;
  handleAddDebt: () => void;
}

export function AdminDebtForm({ showAdd, setShowAdd, activeTab, newDebt, setNewDebt, handleAddDebt }: Props) {
  // Долг перед поставщиком выбирается из справочника: в базе для этого есть
  // связь `Debt.supplierId`, и API её принимает — а форма имя поставщика
  // спрашивала текстом, из-за чего долги оставались без привязки и свод по
  // поставщику собрать было нельзя.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (activeTab !== 'WE_OWE') return;
    fetch('/api/inventory/suppliers').then(r => r.json())
      .then(d => setSuppliers(d.suppliers ?? [])).catch(() => {});
  }, [activeTab]);

  const field = {
    padding: 'var(--space-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
  } as const;

  return (
    <>
{/* Add Debt Form */}
{showAdd && (
  <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
    <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
      {activeTab === 'WHO_OWES_US' ? 'Yangi qarzdor' : 'Yangi qarz'}
    </h4>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-2)' }}>
      {activeTab === 'WE_OWE' ? (
        <select value={newDebt.supplierId} style={field}
          onChange={e => {
            const sup = suppliers.find(s2 => s2.id === e.target.value);
            setNewDebt(p => ({
              ...p,
              supplierId: e.target.value,
              personName: sup?.name ?? p.personName,
              phone: sup?.phone ?? p.phone,
            }));
          }}>
          <option value="">Yetkazuvchi *</option>
          {suppliers.map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
        </select>
      ) : (
        <input placeholder="Ism *" value={newDebt.personName} style={field}
          onChange={e => setNewDebt(p => ({ ...p, personName: e.target.value }))} />
      )}
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
