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

export function AdminCustomers({
  lang,
  isOwner = true,
}: {
  lang: 'ru' | 'uz';
  /**
   * Владелец видит правку и удаление, продавец — нет.
   *
   * Это не только про интерфейс: PUT и DELETE закрыты правилом ADMIN в
   * middleware и вторым рубежом в роуте. Кнопка, которая гарантированно
   * отвечает 403, хуже отсутствующей — она обещает то, чего не будет.
   */
  isOwner?: boolean;
}) {
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
      editCompanyType={s.editCompanyType}
      setEditCompanyType={s.setEditCompanyType}
      editAudience={s.editAudience}
      setEditAudience={s.setEditAudience}
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
          lang={lang}
          onBack={() => s.setSelectedId(null)}
          onEdit={(c) => s.handleEditClick({
            id: c.id,
            name: c.name,
            phone: c.phone,
            telegramUsername: c.telegramUsername,
            customerType: c.customerType,
            companyType: c.companyType ?? null,
            audience: c.audience ?? null,
            companyName: c.companyName,
            city: c.city,
            district: c.district ?? null,
            status: c.status,
            totalSpent: c.totalSpent,
            bonusBalance: c.bonusBalance,
            ordersCount: c.ordersCount,
            notes: c.notes,
            createdAt: c.createdAt,
          })}
        />
        {isOwner && editModal}
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
        companyTypeFilter={s.companyTypeFilter}
        onCompanyType={s.handleCompanyTypeFilter}
        audienceFilter={s.audienceFilter}
        onAudience={s.handleAudienceFilter}
      />

      {s.view === 'map' ? (
        <AdminCustomerMap lang={lang} onOpenCard={s.setSelectedId} isOwner={isOwner} />
      ) : (
        <>
          <AdminCustomerTable
            customers={s.customers}
            loading={s.loading}
            lang={lang}
            handleEditClick={isOwner ? s.handleEditClick : undefined}
            onOpen={(c) => s.setSelectedId(c.id)}
            onDelete={isOwner ? s.handleDeleteCustomer : undefined}
          />

          {!s.loading && s.total > 0 && (
            <AdminPager page={s.page} total={s.total} pageSize={PAGE_SIZE} onPage={s.setPage} />
          )}
        </>
      )}

      {isOwner && editModal}
    </div>
  );
}
