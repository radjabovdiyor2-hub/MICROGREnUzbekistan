'use client';

import { AdminCustomerTable } from './AdminCustomerTable';
import { AdminCustomerEdit } from './AdminCustomerEdit';
import { AdminCustomerCard } from './AdminCustomerCard';
import { AdminCustomersToolbar } from './AdminCustomersToolbar';
import { AdminPager } from './AdminPager';
import { AdminCustomerMap } from './map/AdminCustomerMap';
import { PAGE_SIZE, useAdminCustomers } from './useAdminCustomers';

import { type CustomerItem } from './customerTypes';
export type { CustomerItem };

// ══════════════════════════════════════════════════════════════════════
// Раздел «Клиенты»: список или карта, карточка клиента, правка.
//
// Механика вынесена в useAdminCustomers — здесь осталась только разметка.
// Оба вида работают с одной карточкой клиента и одним кэшем react-query,
// поэтому клик по точке на карте и клик по строке в таблице приводят в
// одно и то же место.
// ══════════════════════════════════════════════════════════════════════

export function AdminCustomers({ lang }: { lang: 'ru' | 'uz' }) {
  const s = useAdminCustomers();

  const editModal = (
    <AdminCustomerEdit
      editingCustomer={s.editingCustomer}
      setEditingCustomer={s.setEditingCustomer}
      editStatus={s.editStatus}
      setEditStatus={s.setEditStatus}
      editBonus={s.editBonus}
      setEditBonus={s.setEditBonus}
      editNotes={s.editNotes}
      setEditNotes={s.setEditNotes}
      saving={s.saving}
      handleSaveCustomer={s.handleSaveCustomer}
    />
  );

  // Открыт клиент — показываем его карточку вместо списка. Тот же приём,
  // что у карточки заказа в AdminOrders.
  if (s.selectedId !== null) {
    return (
      <>
        <AdminCustomerCard
          customerId={s.selectedId}
          onBack={() => s.setSelectedId(null)}
          onEdit={(c) => s.handleEditClick({
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
        {editModal}
      </>
    );
  }

  return (
    <div>
      <AdminCustomersToolbar
        lang={lang}
        loading={s.loading}
        error={s.error}
        searchInput={s.searchInput}
        setSearchInput={s.setSearchInput}
        onSearch={s.handleSearch}
        statusFilter={s.statusFilter}
        onFilter={s.handleFilter}
        onRefresh={() => s.refetch()}
        view={s.view}
        onView={s.setView}
      />

      {s.view === 'map' ? (
        <AdminCustomerMap lang={lang} onOpenCard={s.setSelectedId} />
      ) : (
        <>
          <AdminCustomerTable
            customers={s.customers}
            loading={s.loading}
            lang={lang}
            handleEditClick={s.handleEditClick}
            onOpen={(c) => s.setSelectedId(c.id)}
            onDelete={s.handleDeleteCustomer}
          />

          {!s.loading && s.total > 0 && (
            <AdminPager page={s.page} total={s.total} pageSize={PAGE_SIZE} onPage={s.setPage} />
          )}
        </>
      )}

      {editModal}
    </div>
  );
}
