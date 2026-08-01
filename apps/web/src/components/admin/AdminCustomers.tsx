'use client';

import { AdminCustomerTable } from './AdminCustomerTable';

import { AdminCustomerEdit } from './AdminCustomerEdit';

import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { clientErrorMessage } from '@/lib/safeError';

import { type CustomerItem } from './customerTypes';
export type { CustomerItem };

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

      <AdminCustomerTable
        customers={customers}
        loading={loading}
        lang={lang}
        handleEditClick={handleEditClick}
      />
      <AdminCustomerEdit
        editingCustomer={editingCustomer}
        setEditingCustomer={setEditingCustomer}
        editStatus={editStatus}
        setEditStatus={setEditStatus}
        editBonus={editBonus}
        setEditBonus={setEditBonus}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        saving={saving}
        handleSaveCustomer={handleSaveCustomer}
      />
    </div>
  );
}
