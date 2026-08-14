'use client';

import { AdminCustomerTable } from './AdminCustomerTable';

import { AdminCustomerEdit } from './AdminCustomerEdit';
import { AdminCustomerCard } from './AdminCustomerCard';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientErrorMessage } from '@/lib/safeError';
import { confirmDeleteText, deleteCustomer } from '@/lib/customers/remove';
import { AdminCustomersToolbar } from './AdminCustomersToolbar';
import { AdminPager } from './AdminPager';

import { type CustomerItem } from './customerTypes';
export type { CustomerItem };

interface CustomerPage {
  customers: CustomerItem[];
  total: number;
}

/** Клиентов на странице. Раньше список жёстко обрывался на сотне без
 *  возможности пролистать: 101-й клиент был недостижим. */
const PAGE_SIZE = 50;

export function AdminCustomers({ lang }: { lang: 'ru' | 'uz' }) {
  const [searchInput, setSearchInput] = useState('');
  // Отправленный запрос отделён от того, что человек печатает: он входит в
  // queryKey, поэтому кэш и содержимое поля больше не расходятся. Раньше
  // ключом был только фильтр, и переключение вкладки отдавало сохранённый
  // результат ПРОШЛОГО поиска.
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editBonus, setEditBonus] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading: loading, error, refetch: fetchCustomers } = useQuery<CustomerPage, Error>({
    queryKey: ['admin-customers', statusFilter, searchQuery, page],
    queryFn: async () => {
      const query = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const status = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/customers?limit=${PAGE_SIZE}&page=${page}${query}${status}`);
      if (!res.ok) throw new Error('Failed to fetch customers');
      const body = await res.json();
      return { customers: body.customers || [], total: body.total ?? 0 };
    }
  });

  const customers = data?.customers ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleEditClick = (c: CustomerItem) => {
    setEditingCustomer(c);
    setEditStatus(c.status);
    setEditBonus(c.bonusBalance);
    setEditNotes(c.notes || '');
  };

  // Клиента с заказами база не отдаёт (crm_orders на onDelete: Restrict) —
  // сервер отвечает 409 с числом заказов, и причину показываем как есть.
  const handleDeleteCustomer = async (c: CustomerItem) => {
    if (!window.confirm(confirmDeleteText(c.name))) return;
    try {
      await deleteCustomer(c.id);
      fetchCustomers();
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
    } catch (err: unknown) {
      alert(clientErrorMessage(err, 'Ошибка при удалении'));
    }
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
      // Сообщение сервера показываем как есть. Отказ начислить баллы —
      // осмысленный ответ («карточка не связана с аккаунтом витрины»), и
      // подменять его общим «Ошибка при сохранении» значит снова прятать
      // причину, по которой начисление не работает.
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось сохранить клиента');

      setEditingCustomer(null);
      fetchCustomers();
      // Карточка открыта — её данные тоже устарели.
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
    } catch (err: unknown) {
      alert(clientErrorMessage(err, 'Ошибка при сохранении'));
    } finally {
      setSaving(false);
    }
  };

  // Открыт клиент — показываем его карточку вместо списка. Тот же приём,
  // что у карточки заказа в AdminOrders.
  if (selectedId !== null) {
    return (
      <>
        <AdminCustomerCard
          customerId={selectedId}
          onBack={() => setSelectedId(null)}
          onEdit={(c) => handleEditClick({
            id: c.id,
            name: c.name,
            phone: c.phone,
            telegramUsername: c.telegramUsername,
            customerType: c.customerType,
            companyName: c.companyName,
            city: c.city,
            status: c.status,
            totalSpent: c.totalSpent,
            bonusBalance: c.bonusBalance,
            ordersCount: c.ordersCount,
            notes: c.notes,
            createdAt: c.createdAt,
          })}
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
      </>
    );
  }

  return (
    <div>
      <AdminCustomersToolbar
        lang={lang}
        loading={loading}
        error={error}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearch={handleSearch}
        statusFilter={statusFilter}
        onFilter={(v) => { setStatusFilter(v); setPage(1); }}
        onRefresh={() => fetchCustomers()}
      />

      <AdminCustomerTable
        customers={customers}
        loading={loading}
        lang={lang}
        handleEditClick={handleEditClick}
        onOpen={(c) => setSelectedId(c.id)}
        onDelete={handleDeleteCustomer}
      />

      {!loading && (data?.total ?? 0) > 0 && (
        <AdminPager page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
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
