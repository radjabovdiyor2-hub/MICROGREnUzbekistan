'use client';

import { useEmployees } from './useAdminReferences';
import { CalendarClock, Tag } from 'lucide-react';
// Оба импорта — из модулей БЕЗ серверных зависимостей. Раньше они шли из
// `salesLedger` и `saleInput`, и клиентский бандл тянул Prisma и node:crypto.
import { formatLocalDate } from '@/lib/localDate';
import { SELLER_BACKDATE_DAYS } from '@/lib/pos/rules';
import type { CSSProperties } from 'react';
import { AdminPOSCustomer } from './AdminPOSCustomer';
import type { CartDiscount, ContractPrice, PosCustomer, SaleDate } from './AdminPOSTypes';

// Необязательные условия чека: уступка на всю продажу и деловая дата.
// Обе панели свёрнуты по умолчанию — обычный чек оформляется без них, и
// разворачивать кассу на два лишних поля ради редкого случая незачем.

interface Props {
  isOwner: boolean;
  discount: CartDiscount | null;
  setDiscount: (v: CartDiscount | null) => void;
  saleDate: SaleDate | null;
  setSaleDate: (v: SaleDate | null) => void;
  seller: string;
  setSeller: (v: string) => void;
  customer: PosCustomer | null;
  onPickCustomer: (c: PosCustomer | null, prices: Map<string, ContractPrice>) => void;
  inputStyle: CSSProperties;
}

const panelStyle: CSSProperties = {
  marginBottom: 'var(--space-3)', padding: '10px 12px',
  border: '1.5px solid var(--border)', borderRadius: '12px',
  background: 'var(--bg-secondary)',
};

const toggleStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
  fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)',
  background: 'none', border: 'none', padding: 0, width: '100%',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
  marginBottom: '4px', fontWeight: 600,
};

export function AdminPOSSaleOptions({
  isOwner, discount, setDiscount, saleDate, setSaleDate, seller, setSeller,
  customer, onPickCustomer, inputStyle,
}: Props) {
  // Список сотрудников открыт только владельцу (`/api/inventory/employees`
  // это ADMIN). Продавцу он и не нужен: чек подписывается его сессией, а
  // общий запрос от него получил бы 401 и мусор в консоли.
  const employees = useEmployees();
  const sellers = isOwner ? employees.map(e => e.name) : [];

  // Продавцу дальше семи суток закрыто — сервер откажет, и предлагать такую
  // дату в календаре значит обещать то, чего не будет.
  const minDate = (() => {
    if (isOwner) return undefined;
    const d = new Date();
    d.setDate(d.getDate() - SELLER_BACKDATE_DAYS);
    return formatLocalDate(d);
  })();

  return (
    <>
      <AdminPOSCustomer customer={customer} onPick={onPickCustomer} inputStyle={inputStyle} />

      {/* ── Уступка на весь чек ── */}
      <div style={panelStyle}>
        <button type="button" style={toggleStyle}
          onClick={() => setDiscount(discount ? null : { type: 'percent', value: '', reason: '' })}>
          <Tag size={14} /> Скидка на чек {discount ? '−' : '+'}
        </button>
        {discount && (
          <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={discount.type}
                onChange={e => setDiscount({ ...discount, type: e.target.value === 'fixed' ? 'fixed' : 'percent' })}
                style={{ ...inputStyle, width: 110 }}>
                <option value="percent">%</option>
                <option value="fixed">сум</option>
              </select>
              <input type="number" min="0" placeholder="0" value={discount.value}
                onChange={e => setDiscount({ ...discount, value: e.target.value })}
                style={inputStyle} />
            </div>
            <input type="text" placeholder="Причина: постоянный клиент, опт..."
              value={discount.reason}
              onChange={e => setDiscount({ ...discount, reason: e.target.value })}
              style={inputStyle} />
          </div>
        )}
      </div>

      {/* ── Деловая дата ── */}
      <div style={panelStyle}>
        <button type="button" style={toggleStyle}
          onClick={() => setSaleDate(saleDate ? null : { date: '', reason: '' })}>
          <CalendarClock size={14} /> Продажа задним числом {saleDate ? '−' : '+'}
        </button>
        {saleDate && (
          <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
            <div>
              <div style={labelStyle}>Когда продали</div>
              <input type="date" value={saleDate.date} max={formatLocalDate(new Date())} min={minDate}
                onChange={e => setSaleDate({ ...saleDate, date: e.target.value })}
                style={inputStyle} />
            </div>
            <input type="text" placeholder="Причина: забыли провести вчера..."
              value={saleDate.reason}
              onChange={e => setSaleDate({ ...saleDate, reason: e.target.value })}
              style={inputStyle} />
            {isOwner && (
              <div>
                <div style={labelStyle}>Кто продал</div>
                <input type="text" list="pos-sellers" placeholder="Продавец"
                  value={seller} onChange={e => setSeller(e.target.value)}
                  style={inputStyle} />
                <datalist id="pos-sellers">
                  {sellers.map(name => <option key={name} value={name} />)}
                </datalist>
              </div>
            )}
            {!isOwner && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Не старше {SELLER_BACKDATE_DAYS} дней. Более давние проводит владелец.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
