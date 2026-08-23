'use client';

import { Edit3, Gift, Phone, ShoppingCart } from 'lucide-react';

import type { CustomerCard } from '@/lib/customers/card';
import {
  AUDIENCE_RELEVANT,
  audienceLabel,
  companyTypeLabel,
} from '@/lib/customers/companyTypes';
import { districtLabel } from '@/lib/customers/districts';
import { sumLabel } from '@/lib/customers/money';

import { AdminCustomerPrices } from './AdminCustomerPrices';

// Шапка карточки клиента: кто это, чем закончились отношения, что можно
// сделать. Вынесена из AdminCustomerCard — с кнопкой продажи файл
// перерастал 200 строк.

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

export function AdminCustomerCardHead({ data, lang, onEdit, onSell }: {
  data: CustomerCard;
  lang: 'ru' | 'uz';
  onEdit: (c: CustomerCard) => void;
  onSell: () => void;
}) {
  return (
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

        {/* Продажа — главное действие карточки, поэтому она основная кнопка,
            а правка ушла во второстепенные. Открыть клиента и не иметь
            возможности ему продать — ровно то, из-за чего продавцы вели
            продажи мимо системы. */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button onClick={onSell} className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <ShoppingCart size={14} /> Продать
          </button>
          <button onClick={() => onEdit(data)} className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Edit3 size={14} /> Правка
          </button>
        </div>
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
        {/* Прочерк, а не «0 сум»: продавцу суммы не показываем. */}
        <Stat label="Потрачено" value={sumLabel(data.totalSpent, 'ru')} color="var(--success)" />
        <Stat
          label="Бонусы"
          value={data.bonusBalance === null ? '—' : fmtMoney(data.bonusBalance)}
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

      <AdminCustomerPrices customerId={data.id} />
    </div>
  );
}
