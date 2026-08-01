'use client';

import type { Dispatch, SetStateAction } from 'react';
import { X } from 'lucide-react';
import type { CustomerItem } from './customerTypes';

// Модалка правки клиента: статус, бонусы, заметки.


interface Props {
  editingCustomer: CustomerItem | null;
  setEditingCustomer: Dispatch<SetStateAction<CustomerItem | null>>;
  editStatus: string;
  setEditStatus: Dispatch<SetStateAction<string>>;
  editBonus: number;
  setEditBonus: Dispatch<SetStateAction<number>>;
  editNotes: string;
  setEditNotes: Dispatch<SetStateAction<string>>;
  saving: boolean;
  handleSaveCustomer: () => void;
}

export function AdminCustomerEdit({ editingCustomer, setEditingCustomer, editStatus, setEditStatus, editBonus, setEditBonus, editNotes, setEditNotes, saving, handleSaveCustomer }: Props) {
  return (
    <>
{/* Edit Modal */}
{editingCustomer && (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-lg font-bold text-white">Редактирование Клиента #{editingCustomer.id}</h3>
        <button onClick={() => setEditingCustomer(null)} className="text-slate-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div>
        <label className="text-xs text-slate-400 font-semibold uppercase">Имя Клиента</label>
        <div className="text-sm font-bold text-white mt-1">{editingCustomer.name}</div>
      </div>

      <div>
        <label className="text-xs text-slate-400 font-semibold uppercase">Статус Клиента</label>
        <select
          value={editStatus}
          onChange={(e) => setEditStatus(e.target.value)}
          className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
        >
          <option value="lead">Lead (Лид)</option>
          <option value="client">Client (Клиент)</option>
          <option value="vip">VIP Клиент</option>
          <option value="blocked">Blocked (Заблокирован)</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-slate-400 font-semibold uppercase">Бонусные Баллы (Сум)</label>
        <input
          type="number"
          value={editBonus}
          onChange={(e) => setEditBonus(Number(e.target.value))}
          className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 font-semibold uppercase">Заметки Менеджера</label>
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          rows={3}
          className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none"
          placeholder="Заметки о клиенте..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={() => setEditingCustomer(null)}
          className="px-4 py-2 bg-slate-800 text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-700"
        >
          Отмена
        </button>
        <button
          onClick={handleSaveCustomer}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  </div>
)}
    </>
  );
}
