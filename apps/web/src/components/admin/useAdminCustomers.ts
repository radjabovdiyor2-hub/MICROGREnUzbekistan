'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { clientErrorMessage } from '@/lib/safeError';
import { confirmDeleteText, deleteCustomer } from '@/lib/customers/remove';

import { useFeedback } from './AdminFeedback';
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
  const notify = useFeedback();
  const [searchInput, setSearchInput] = useState('');
  // Отправленный запрос отделён от того, что человек печатает: он входит в
  // queryKey, поэтому кэш и содержимое поля больше не расходятся. Раньше
  // ключом был только фильтр, и переключение вкладки отдавало сохранённый
  // результат ПРОШЛОГО поиска.
  const [searchQuery, setSearchQuery] = useState('');
  // Две оси вместо одного смешанного ряда: статус отношений и тип клиента.
  // Пустой набор означает «все» — отдельного значения 'all' в наборе нет,
  // иначе его пришлось бы исключать в каждом месте, где набор читается.
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());

  /** Устойчивые представления наборов: ключ кэша не должен зависеть от
   *  порядка нажатий, иначе один и тот же выбор даёт разные ключи. */
  const statusKey = [...statuses].sort().join(',');
  const typeKey = [...types].sort().join(',');
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
      statusKey,
      typeKey,
      searchQuery,
      page,
      companyTypeFilter,
      audienceFilter,
    ],
    queryFn: async () => {
      const query = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
      const status = statusKey ? `&status=${statusKey}` : '';
      const who = typeKey ? `&customerType=${typeKey}` : '';
      const type = companyTypeFilter !== 'all' ? `&companyType=${companyTypeFilter}` : '';
      const aud = audienceFilter !== 'all' ? `&audience=${audienceFilter}` : '';
      const res = await fetch(
        `/api/admin/customers?limit=${PAGE_SIZE}&page=${page}${query}${status}${who}${type}${aud}`,
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

  /** Переключить одно значение набора и вернуться на первую страницу. */
  const flip = (set: (fn: (prev: Set<string>) => Set<string>) => void) => (value: string) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    // Иначе человек остаётся на пятой странице выборки, которой больше нет.
    setPage(1);
  };

  const toggleStatus = flip(setStatuses);
  const toggleType = flip(setTypes);

  const clearStatuses = () => { setStatuses(new Set()); setPage(1); };
  const clearTypes = () => { setTypes(new Set()); setPage(1); };

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
    // Правка открыта только владельцу, а у него суммы не скрыты. Ноль на
    // случай, если форму всё же откроют без них: пустое поле бонуса
    // отправило бы NaN.
    setEditBonus(c.bonusBalance ?? 0);
    setEditNotes(c.notes || '');
    setEditCompanyType(c.companyType || '');
    setEditAudience(c.audience || '');
  };

  // Клиента с заказами база не отдаёт (crm_orders на onDelete: Restrict) —
  // сервер отвечает 409 с числом заказов, и причину показываем как есть.
  const handleDeleteCustomer = async (c: CustomerItem) => {
    const agreed = await notify.confirm({
      title: `Удалить клиента «${c.name}» безвозвратно?`,
      // Текст последствий один на все места удаления клиента — он живёт в
      // `lib/customers/remove`, чтобы веб и бот обещали одно и то же.
      detail: confirmDeleteText(c.name).split('\n\n')[1],
      confirmText: 'Удалить',
      danger: true,
    });
    if (!agreed) return;

    try {
      await deleteCustomer(c.id);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
      notify.success(`Клиент «${c.name}» удалён`);
    } catch (err: unknown) {
      notify.error(clientErrorMessage(err, 'Не удалось удалить клиента'));
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
      notify.success('Сохранено');
    } catch (err: unknown) {
      notify.error(clientErrorMessage(err, 'Не удалось сохранить клиента'));
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
    statuses,
    toggleStatus,
    clearStatuses,
    types,
    toggleType,
    clearTypes,
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
