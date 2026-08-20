'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Edit3, Gift, Phone, RefreshCw } from 'lucide-react';
import type { CustomerCard } from '@/lib/customers/card';
import {
  AUDIENCE_RELEVANT,
  audienceLabel,
  companyTypeLabel,
} from '@/lib/customers/companyTypes';
import { districtLabel } from '@/lib/customers/districts';
import { AdminCustomerOrders } from './AdminCustomerOrders';
import { AdminCustomerActivity } from './AdminCustomerActivity';
import { AdminCustomerPrices } from './AdminCustomerPrices';

// Экран одного клиента: контакты, сводка, история заказов, обращения.
// Открывается кликом по строке в таблице — так же, как карточка заказа
// в AdminOrders. Правка полей осталась в модалке AdminCustomerEdit.

const STATUS_LABELS: Record<string, string> = {
  lead: 'Лид',
  active: 'Активный',
  vip: 'VIP',
  churned: 'Ушедший',
};

const fmtMoney = (n: number) => n.toLocaleString('ru-RU');
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function Stat({ label, value, hint, color }: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{hint}</div>
      )}
    </div>
  );
}

export function AdminCustomerCard({ customerId, lang, onBack, onEdit }: {
  customerId: number;
  lang: 'ru' | 'uz';
  onBack: () => void;
  onEdit: (c: CustomerCard) => void;
}) {
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

      {/* Шапка: кто это и чем закончились отношения с ним */}
      <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)' }}>
              {data.name}
            </h2>
            {data.companyName && (
              <div style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>
                🏢 {data.companyName}
                {/* Подпись, а не слаг. Здесь стояло сырое значение колонки,
                    и владелец читал «Плов Центр · toyxona» — то же самое
                    место, где во всех остальных экранах уже стоит перевод. */}
                {data.companyType ? ` · ${companyTypeLabel(data.companyType, lang)}` : ''}
                {data.companyType && AUDIENCE_RELEVANT.includes(data.companyType) && (
                  <span style={{ color: data.audience ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    {' · '}
                    {audienceLabel(data.audience, lang)}
                  </span>
                )}
                {data.district && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' · '}
                    {districtLabel(data.district, lang)}
                  </span>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 'var(--text-sm)' }}>
              <Phone size={13} style={{ color: 'var(--text-muted)' }} />
              {data.phone}
              {data.telegramUsername && (
                <span style={{ color: 'var(--brand-primary)' }}>@{data.telegramUsername}</span>
              )}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              {data.customerType.toUpperCase()} · {STATUS_LABELS[data.status] || data.status} · {data.city}
              {data.source ? ` · источник: ${data.source}` : ''} · с {fmtDate(data.createdAt)}
            </div>
          </div>

          <button onClick={() => onEdit(data)} className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Edit3 size={14} /> Правка
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-4)',
          paddingTop: 'var(--space-3)',
          borderTop: '1px solid var(--border)',
        }}>
          <Stat label="Заказов" value={String(data.ordersCount)} />
          <Stat label="Потрачено" value={`${fmtMoney(data.totalSpent)} сум`} color="var(--success)" />
          <Stat
            label="Бонусы"
            value={fmtMoney(data.bonusBalance)}
            color="var(--warning)"
            // Баллы лежат на аккаунте витрины, а не в карточке CRM. Если
            // связки нет, начислить их некуда — и это должно быть видно
            // здесь, а не выясняться отказом при сохранении.
            hint={data.webAccount ? 'счёт витрины привязан' : 'нет связки с витриной'}
          />
          <Stat label="Последний заказ" value={fmtDate(data.lastOrderDate)} />
        </div>

        {!data.webAccount && (
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            <Gift size={14} />
            Карточка не связана с аккаунтом витрины: начислить баллы нельзя, пока
            клиент не оформит заказ через сайт или бота.
          </div>
        )}

        {data.notes && (
          <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Заметки: </span>{data.notes}
          </div>
        )}

        <AdminCustomerPrices customerId={customerId} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <AdminCustomerOrders orders={data.orders} />
        <AdminCustomerActivity interactions={data.interactions} followups={data.followups} />
      </div>
    </div>
  );
}
