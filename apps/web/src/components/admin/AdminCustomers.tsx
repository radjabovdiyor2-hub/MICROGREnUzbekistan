'use client';

import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, Edit3, Gift, Phone, X, AlertCircle } from 'lucide-react';
import { clientErrorMessage } from '@/lib/safeError';

interface CustomerItem {
  id: number;
  name: string;
  phone: string;
  telegramUsername: string | null;
  customerType: string;
  companyName: string | null;
  city: string;
  status: string;
  totalSpent: number;
  bonusBalance: number;
  ordersCount: number;
  notes: string;
  createdAt: string;
}

export function AdminCustomers({ lang }: { lang: 'ru' | 'uz' }) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editBonus, setEditBonus] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const status = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/customers?${query}${status}`);
      if (!res.ok) throw new Error('Failed to fetch customers');
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err: unknown) {
      setError(clientErrorMessage(err, 'Ошибка загрузки клиентов'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleEditClick = (c: CustomerItem) => {
    setEditingCustomer(c);
    setEditStatus(c.status);
    setEditBonus(c.bonusBalance);
    setEditNotes(c.notes || '');
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCustomer.id,
          status: editStatus,
          bonusBalance: editBonus,
          notes: editNotes,
        }),
      });
      if (!res.ok) throw new Error('Failed to update customer');
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err: unknown) {
      alert(clientErrorMessage(err, 'Ошибка при сохранении'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-500/20 rounded-2xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-semibold mb-1">
            <Users size={22} />
            <span>{lang === 'ru' ? 'Управление Клиентами и Бонусами 360°' : 'Mijozlar Boshqaruvi 360°'}</span>
          </div>
          <h2 className="text-2xl font-bold text-white">
            {lang === 'ru' ? 'База Клиентов, B2B Кабинеты и Лояльность' : 'Mijozlar Bazasi Va Sodiqlik'}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {lang === 'ru'
              ? 'Просмотр заказов, корректировка бонусных баллов, изменение статусов лидов и замерок.'
              : 'Buyurtmalar, bonus ballari va mijozlar maqomini boshqarish.'}
          </p>
        </div>

        <button
          onClick={fetchCustomers}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 self-start md:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>{lang === 'ru' ? 'Обновить' : 'Yangilash'}</span>
        </button>
      </div>

      {/* Ошибка загрузки. Раньше error присваивался, но не выводился нигде:
          при отказе API экран просто оставался пустым, и владелец видел
          «клиентов нет» вместо «список не загрузился». */}
      {error && (
        <div className="p-4 bg-rose-900/30 border border-rose-500/30 text-rose-300 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-xl">
        <form onSubmit={handleSearch} className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ru' ? 'Поиск по имени, телефону, username...' : 'Qidiruv...'}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </form>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {['all', 'lead', 'client', 'vip', 'b2b'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase transition-all ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

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
    </div>
  );
}
