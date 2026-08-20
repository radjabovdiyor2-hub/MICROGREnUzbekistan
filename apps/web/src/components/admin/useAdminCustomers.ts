'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { clientErrorMessage } from '@/lib/safeError';
import { confirmDeleteText, deleteCustomer } from '@/lib/customers/remove';

import { type CustomerItem } from './customerTypes';

// ══════════════════════════════════════════════════════════════════════
// Состояние раздела «Клиенты»: список, фильтры, правка, вид.
//
// Вынесено из AdminCustomers, который упёрся в 200 строк ровно в тот
// момент, когда к списку добавился второй вид — карта. Тот же приём, что
// у useAdminTasks и useAdminSettings: контейнер остаётся разметкой, а вся
// механика живёт здесь и читается отдельно от неё.
// ══════════════════════════════════════════════════════════════════════

/** Клиентов на странице. Раньше список жёстко обрывался на сотне без
 *  возможности пролистать: 101-й клиент был недостижим. */
export const PAGE_SIZE = 50;

/** Список или карта. Вид живёт в состоянии раздела, а не в URL-вкладке:
 *  вкладка одна, «Клиенты», и переключение вида её не меняет. */
export type CustomersView = 'list' | 'map';

interface CustomerPage {
  customers: CustomerItem[];
  total: number;
}

export function useAdminCustomers() {
  const [searchInput, setSearchInput] = useState('');
  // Отправленный запрос отделён от того, что человек печатает: он входит в
  // queryKey, поэтому кэш и содержимое поля больше не расходятся. Раньше
  // ключом был только фильтр, и переключение вкладки отдавало сохранённый
  // результат ПРОШЛОГО поиска.
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Тип заведения и аудитория — те же фильтры, что у карты. Список и карта
  // это два вида ОДНОГО раздела, и уметь на карте то, чего нельзя в
  // списке, — верный способ отучить людей верить фильтрам.
  const [companyTypeFilter, setCompanyTypeFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<CustomersView>('list');

  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editBonus, setEditBonus] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');
  const [editCompanyType, setEditCompanyType] = useState('');
  const [editAudience, setEditAudience] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading: loading, error, refetch } = useQuery<CustomerPage, Error>({
    queryKey: [
      'admin-customers',
      statusFilter,
      searchQuery,
      page,
      companyTypeFilter,
      audienceFilter,
    ],
    queryFn: async () => {
      const query = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const status = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const type = companyTypeFilter !== 'all' ? `&companyType=${companyTypeFilter}` : '';
      const aud = audienceFilter !== 'all' ? `&audience=${audienceFilter}` : '';
      const res = await fetch(
        `/api/admin/customers?limit=${PAGE_SIZE}&page=${page}${query}${status}${type}${aud}`,
      );
      if (!res.ok) throw new Error('Failed to fetch customers');
      const body = await res.json();
      return { customers: body.customers || [], total: body.total ?? 0 };
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleFilter = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleCompanyTypeFilter = (value: string) => {
    setCompanyTypeFilter(value);
    // Аудитория без своего типа заведения почти всегда даёт пустой список,
    // а невидимый включённый фильтр читается как «клиентов нет».
    setAudienceFilter('all');
    setPage(1);
  };

  const handleAudienceFilter = (value: string) => {
    setAudienceFilter(value);
    setPage(1);
  };

  const handleEditClick = (c: CustomerItem) => {
    setEditingCustomer(c);
    setEditStatus(c.status);
    setEditBonus(c.bonusBalance);
    setEditNotes(c.notes || '');
    setEditCompanyType(c.companyType || '');
    setEditAudience(c.audience || '');
  };

  // Клиента с заказами база не отдаёт (crm_orders на onDelete: Restrict) —
  // сервер отвечает 409 с числом заказов, и причину показываем как есть.
  const handleDeleteCustomer = async (c: CustomerItem) => {
    if (!window.confirm(confirmDeleteText(c.name))) return;
    try {
      await deleteCustomer(c.id);
      refetch();
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
          companyType: editCompanyType,
          // Пустая строка = «снять аудиторию». Это осмысленный ответ («тут
          // смешанный зал, я ошибся»), а не отсутствие правки, поэтому
          // сервер её и различает.
          audience: editAudience,
        }),
      });
      // Сообщение сервера показываем как есть. Отказ начислить баллы —
      // осмысленный ответ («карточка не связана с аккаунтом витрины»), и
      // подменять его общим «Ошибка при сохранении» значит снова прятать
      // причину, по которой начисление не работает.
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось сохранить клиента');

      setEditingCustomer(null);
      refetch();
      // Карточка открыта — её данные тоже устарели.
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
    } catch (err: unknown) {
      alert(clientErrorMessage(err, 'Ошибка при сохранении'));
    } finally {
      setSaving(false);
    }
  };

  return {
    customers: data?.customers ?? [],
    total: data?.total ?? 0,
    loading,
    error,
    refetch,

    searchInput,
    setSearchInput,
    handleSearch,
    statusFilter,
    handleFilter,
    companyTypeFilter,
    handleCompanyTypeFilter,
    audienceFilter,
    handleAudienceFilter,
    page,
    setPage,
    view,
    setView,

    selectedId,
    setSelectedId,
    editingCustomer,
    setEditingCustomer,
    editStatus,
    setEditStatus,
    editBonus,
    setEditBonus,
    editNotes,
    setEditNotes,
    editCompanyType,
    setEditCompanyType,
    editAudience,
    setEditAudience,
    saving,
    handleEditClick,
    handleDeleteCustomer,
    handleSaveCustomer,
  };
}
