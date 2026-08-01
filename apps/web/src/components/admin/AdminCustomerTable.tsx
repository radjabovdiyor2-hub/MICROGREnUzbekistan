'use client';

import { Edit3, Gift, Phone, RefreshCw, Users } from 'lucide-react';
import type { CustomerItem } from './customerTypes';

// Таблица клиентов: контакты, тип, суммы, бонусы.


interface Props {
  customers: CustomerItem[];
  loading: boolean;
  lang: 'ru' | 'uz';
  handleEditClick: (c: CustomerItem) => void;
}

export function AdminCustomerTable({ customers, loading, lang, handleEditClick }: Props) {
  return (
    <>
{/* Customer Table */}
{loading ? (
  <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
    <RefreshCw size={20} className="animate-spin text-blue-400" />
    <span>{lang === 'ru' ? 'Загрузка клиентов...' : 'Yuklanmoqda...'}</span>
  </div>
) : customers.length === 0 ? (
  <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
    <Users size={40} className="mx-auto text-slate-600 mb-3" />
    <h3 className="text-lg font-semibold text-slate-300">
      {lang === 'ru' ? 'Клиенты не найдены' : 'Mijozlar topilmadi'}
    </h3>
  </div>
) : (
  <div className="overflow-x-auto bg-slate-900/60 border border-slate-800 rounded-2xl">
    <table className="w-full text-left text-sm text-slate-300">
      <thead className="bg-slate-950 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
        <tr>
          <th className="p-4">Клиент</th>
          <th className="p-4">Телефон / TG</th>
          <th className="p-4">Тип / Статус</th>
          <th className="p-4">Заказов</th>
          <th className="p-4">Потрачено</th>
          <th className="p-4">Бонусы</th>
          <th className="p-4 text-right">Действие</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/60">
        {customers.map((c) => (
          <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
            <td className="p-4">
              <div className="font-semibold text-white">{c.name}</div>
              {c.companyName && (
                <div className="text-xs text-blue-400">🏢 {c.companyName}</div>
              )}
              <div className="text-xs text-slate-500">{c.city}</div>
            </td>
            <td className="p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Phone size={13} className="text-slate-500" />
                <span>{c.phone}</span>
              </div>
              {c.telegramUsername && (
                <div className="text-xs text-blue-400 mt-0.5">@{c.telegramUsername}</div>
              )}
            </td>
            <td className="p-4">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                c.status === 'vip' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                c.status === 'client' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                'bg-slate-800 text-slate-400'
              }`}>
                {c.customerType.toUpperCase()} / {c.status.toUpperCase()}
              </span>
            </td>
            <td className="p-4 font-mono font-medium text-white">{c.ordersCount}</td>
            <td className="p-4 font-mono text-emerald-400">{c.totalSpent.toLocaleString()} сум</td>
            <td className="p-4">
              <span className="flex items-center gap-1 font-mono font-bold text-amber-400">
                <Gift size={14} />
                {c.bonusBalance}
              </span>
            </td>
            <td className="p-4 text-right">
              <button
                onClick={() => handleEditClick(c)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-all"
              >
                <Edit3 size={14} className="inline mr-1" />
                Правка
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
    </>
  );
}
