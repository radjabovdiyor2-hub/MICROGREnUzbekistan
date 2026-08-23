'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import type { CustomerCard } from '@/lib/customers/card';
import { AdminCustomerCardHead } from './AdminCustomerCardHead';
import { AdminCustomerOrders } from './AdminCustomerOrders';
import { AdminCustomerActivity } from './AdminCustomerActivity';
import { PosSaleSheet } from './PosSaleSheet';
import { useAdminBack } from './useAdminBack';

// Экран одного клиента: контакты, сводка, история заказов, обращения.
// Открывается кликом по строке в таблице — так же, как карточка заказа
// в AdminOrders. Правка полей осталась в модалке AdminCustomerEdit.
//
// Продать можно прямо отсюда — тем же листом, что и с точки на карте.
// Открыть клиента и не иметь возможности провести ему продажу значило
// заставлять продавца искать его в кассе поиском заново.

export function AdminCustomerCard({ customerId, lang, sellerName, onBack, onEdit }: {
  customerId: number;
  lang: 'ru' | 'uz';
  /** Кем подписывать чек, пробитый из карточки. */
  sellerName: string;
  onBack: () => void;
  onEdit: (c: CustomerCard) => void;
}) {
  const queryClient = useQueryClient();
  const [selling, setSelling] = useState(false);

  // Аппаратное «назад» в Telegram закрывает карточку, а не приложение.
  // Порядок важен: открытая касса перехватывает кнопку поверх карточки, и
  // первое нажатие закрывает её, второе — возвращает к списку.
  const closeSale = useCallback(() => setSelling(false), []);
  useAdminBack(onBack, !selling);
  useAdminBack(closeSale, selling);

  const { data, isLoading, error } = useQuery<CustomerCard, Error>({
    queryKey: ['admin-customer', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers?id=${customerId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Не удалось загрузить карточку');
      return body.customer as CustomerCard;
    },
  });

  const back = (
    <button onClick={onBack} className="btn btn-ghost btn-sm"
      style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <ArrowLeft size={16} /> К списку клиентов
    </button>
  );

  if (isLoading) {
    return (
      <div>
        {back}
        <div className="card" style={{ padding: 'var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <RefreshCw size={20} className="animate-spin" /> Загрузка карточки…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        {back}
        <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '3px solid var(--error)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--error)' }}>
          <AlertCircle size={18} /> {error?.message || 'Клиент не найден'}
        </div>
      </div>
    );
  }

  return (
    <div>
      {back}

      <AdminCustomerCardHead
        data={data}
        lang={lang}
        onEdit={onEdit}
        onSell={() => setSelling(true)}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <AdminCustomerOrders orders={data.orders} />
        <AdminCustomerActivity interactions={data.interactions} followups={data.followups} />
      </div>

      {/* Продажа — модалкой поверх карточки, как правка: уходить с экрана
          клиента ради его же продажи незачем. Визит отсюда НЕ отмечается —
          это работа за столом, а не поездка (для неё есть точка на карте). */}
      {selling && (
        <div
          onClick={() => setSelling(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'var(--bg-overlay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-4)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto' }}
          >
            <PosSaleSheet
              customer={{ id: data.id, name: data.companyName || data.name, phone: data.phone === '—' ? null : data.phone }}
              lang={lang}
              sellerName={sellerName}
              origin="counter"
              onClose={() => setSelling(false)}
              onSold={() => {
                queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] });
                queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
