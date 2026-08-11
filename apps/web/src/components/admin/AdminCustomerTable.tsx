'use client';

import { Edit3, Gift, Phone, RefreshCw, Users } from 'lucide-react';
import type { CustomerItem } from './customerTypes';

// Таблица клиентов: контакты, тип, суммы, бонусы.
//
// Стили — инлайн на токенах, как в остальных 113 компонентах админки.
// Раньше этот файл был одним из трёх на Tailwind, а Tailwind в проекте
// намеренно уложен в слой НИЖЕ нелоерового legacy-CSS (см. globals.css:9-11).
// Глобальный сброс `* { margin: 0; padding: 0 }` тоже вне слоёв — и потому
// съедал каждую утилиту отступа: p-4 на ячейках не работал вовсе.

interface Props {
  customers: CustomerItem[];
  loading: boolean;
  lang: 'ru' | 'uz';
  handleEditClick: (c: CustomerItem) => void;
  /** Открыть карточку клиента с историей заказов. */
  onOpen: (c: CustomerItem) => void;
}

const cell: React.CSSProperties = {
  padding: 'var(--space-3)',
  fontSize: 'var(--text-sm)',
  verticalAlign: 'top',
};

const head: React.CSSProperties = {
  ...cell,
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};

/** Цвет статуса — из токенов. Хардкод цветов запрещён конституцией. */
function statusColor(status: string): string {
  if (status === 'vip') return 'var(--warning)';
  if (status === 'active') return 'var(--success)';
  if (status === 'churned') return 'var(--error)';
  return 'var(--text-muted)';
}

export function AdminCustomerTable({ customers, loading, lang, handleEditClick, onOpen }: Props) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', color: 'var(--text-muted)' }}>
        <RefreshCw size={20} className="animate-spin" />
        <span>{lang === 'ru' ? 'Загрузка клиентов…' : 'Yuklanmoqda…'}</span>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <Users size={40} style={{ margin: '0 auto var(--space-2)', color: 'var(--text-muted)' }} />
        <h3 style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)' }}>
          {lang === 'ru' ? 'Клиенты не найдены' : 'Mijozlar topilmadi'}
        </h3>
      </div>
    );
  }

  return (
    // overflowX инлайном, а не классом: .card задаёт overflow: hidden вне
    // слоёв, и класс-утилита его не перебьёт. Без этой обёртки последняя
    // колонка просто срезалась за правым краем.
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={head}>Клиент</th>
            <th style={head}>Телефон / TG</th>
            <th style={head}>Тип / Статус</th>
            <th style={head}>Заказов</th>
            <th style={head}>Потрачено</th>
            <th style={head}>Бонусы</th>
            <th style={{ ...head, textAlign: 'right' }}>Действие</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            // Строка открывает карточку с историей заказов. Кнопка «Правка»
            // ниже останавливает всплытие, иначе она открывала бы и карточку.
            <tr key={c.id} onClick={() => onOpen(c)} style={{ borderBottom: '1px solid var(--border-secondary, var(--border))', cursor: 'pointer' }}>
              <td style={cell}>
                <div style={{ fontWeight: 'var(--font-semibold)' }}>{c.name}</div>
                {c.companyName && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)' }}>
                    🏢 {c.companyName}
                  </div>
                )}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{c.city}</div>
              </td>
              <td style={cell}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <Phone size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span>{c.phone}</span>
                </div>
                {c.telegramUsername && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)', marginTop: 2 }}>
                    @{c.telegramUsername}
                  </div>
                )}
              </td>
              <td style={cell}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-semibold)',
                  whiteSpace: 'nowrap',
                  color: statusColor(c.status),
                  background: `color-mix(in srgb, ${statusColor(c.status)} 14%, transparent)`,
                }}>
                  {c.customerType.toUpperCase()} / {c.status.toUpperCase()}
                </span>
              </td>
              <td style={{ ...cell, fontWeight: 'var(--font-semibold)' }}>{c.ordersCount}</td>
              <td style={{ ...cell, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                {c.totalSpent.toLocaleString('ru-RU')} сум
              </td>
              <td style={cell}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 'var(--font-bold)', color: 'var(--warning)' }}>
                  <Gift size={14} />
                  {c.bonusBalance}
                </span>
              </td>
              <td style={{ ...cell, textAlign: 'right' }}>
                <button onClick={(e) => { e.stopPropagation(); handleEditClick(c); }} className="btn btn-sm btn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <Edit3 size={14} />
                  Правка
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
