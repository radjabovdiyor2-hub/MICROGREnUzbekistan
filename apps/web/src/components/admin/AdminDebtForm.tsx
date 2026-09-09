'use client';

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { useSuppliers } from './useAdminReferences';

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
  /** Заполняется в закладке «нам должны»: связь долга с заведением CRM. */
  customerId: string;
}

interface CustomerHint { id: number; name: string; phone: string | null }


interface Props {
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  activeTab: string;
  newDebt: DebtDraft;
  setNewDebt: Dispatch<SetStateAction<DebtDraft>>;
  handleAddDebt: () => void;
  /** Запрос в пути: кнопка блокируется, чтобы долг не завёлся дважды. */
  saving: boolean;
  /** Отказ сервера. Пустая строка — показывать нечего. */
  error: string;
}

export function AdminDebtForm({
  showAdd, setShowAdd, activeTab, newDebt, setNewDebt, handleAddDebt, saving, error,
}: Props) {
  // Долг перед поставщиком выбирается из справочника: в базе для этого есть
  // связь `Debt.supplierId`, и API её принимает — а форма имя поставщика
  // спрашивала текстом, из-за чего долги оставались без привязки и свод по
  // поставщику собрать было нельзя.
  // Раньше список тянулся только на вкладке «мы должны» — с общим кэшем
  // условие не нужно: запрос всё равно один на всю админку.
  const suppliers = useSuppliers();

  // ── Подсказки заведений для закладки «нам должны» ──────────────────
  //
  // ЗАЧЕМ. Долг перед поставщиком выбирался из справочника, а долг
  // заведения вводился именем текстом — и потому не привязывался к
  // карточке клиента. Следствие видно на карте: точка есть, сумма есть,
  // а вместе их не свести.
  //
  // ПОЧЕМУ ПОДСКАЗКА, А НЕ ВЫПАДАЮЩИЙ СПИСОК. Поставщиков десятки, а
  // заведений тысячи: список пришлось бы грузить целиком и прокручивать.
  // Поле остаётся обычным вводом — должник, которого нет в CRM,
  // заводится как раньше, просто без привязки.
  const [hints, setHints] = useState<CustomerHint[]>([]);
  useEffect(() => {
    const q = newDebt.personName.trim();
    // Задержка: иначе запрос уходит на каждую букву. Сюда же убран сброс
    // подсказок — синхронный setState в теле эффекта даёт лишний каскад
    // перерисовок, и на это ругается линтер.
    const t = setTimeout(async () => {
      if (activeTab !== 'WHO_OWES_US' || q.length < 2) {
        setHints([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/admin/customers?q=${encodeURIComponent(q)}&limit=10`,
          { credentials: 'same-origin' },
        );
        if (!res.ok) return;
        const body = await res.json();
        const rows = Array.isArray(body) ? body : (body.customers ?? body.items ?? []);
        setHints(
          rows
            .map((r: Record<string, unknown>) => ({
              id: Number(r.id),
              name: String(r.companyName || r.name || ''),
              phone: (r.phone as string) ?? null,
            }))
            .filter((r: CustomerHint) => r.id && r.name),
        );
      } catch {
        // Молча: подсказки — удобство, их отказ не должен мешать завести долг.
        setHints([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [newDebt.personName, activeTab]);

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
        <>
          <input placeholder="Ism *" list="debt-customer-hints" value={newDebt.personName} style={field}
            onChange={e => {
              const value = e.target.value;
              // Привязка ставится только при ТОЧНОМ совпадении с подсказкой.
              // Похожее имя — не тот же клиент: «Чайхана» в базе десяток.
              const hit = hints.find(h => h.name === value);
              setNewDebt(p => ({
                ...p,
                personName: value,
                customerId: hit ? String(hit.id) : '',
                phone: hit?.phone ?? p.phone,
              }));
            }} />
          <datalist id="debt-customer-hints">
            {hints.map(h => <option key={h.id} value={h.name} />)}
          </datalist>
        </>
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
      <button onClick={handleAddDebt} disabled={saving} className="btn btn-primary btn-sm">
        {saving ? 'Saqlanmoqda…' : 'Saqlash'}
      </button>
      <button onClick={() => setShowAdd(false)} className="btn btn-ghost btn-sm">Bekor</button>
      {error && (
        <span style={{ color: 'var(--error)', fontSize: 'var(--text-sm)', alignSelf: 'center' }}>
          {error}
        </span>
      )}
    </div>
  </div>
)}
    </>
  );
}
