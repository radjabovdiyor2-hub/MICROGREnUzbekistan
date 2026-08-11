'use client';

import { AlertCircle, RefreshCw, Search, Users } from 'lucide-react';

// Шапка раздела «Клиенты», сообщение об отказе загрузки, поиск и фильтры.
// Вынесено из AdminCustomers: тот перерос 200 строк, когда к списку
// добавилась карточка клиента.

// Значения соответствуют колонкам базы: lead/active/vip — это `status`,
// b2b — это `customer_type`. Прежний набор содержал «client», статуса с таким
// именем не существует вовсе, и кнопка всегда отдавала пустой список.
export const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'lead', label: 'Лиды' },
  { value: 'active', label: 'Активные' },
  { value: 'vip', label: 'VIP' },
  { value: 'b2b', label: 'B2B' },
] as const;

interface Props {
  lang: 'ru' | 'uz';
  loading: boolean;
  error: Error | null;
  searchInput: string;
  setSearchInput: (v: string) => void;
  onSearch: (e: React.FormEvent) => void;
  statusFilter: string;
  onFilter: (value: string) => void;
  onRefresh: () => void;
}

export function AdminCustomersToolbar({
  lang, loading, error, searchInput, setSearchInput,
  onSearch, statusFilter, onFilter, onRefresh,
}: Props) {
  return (
    <>
      {/* Шапка раздела */}
      <div
        className="card"
        style={{
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          // Без переноса заголовок и кнопка «Обновить» на телефоне
          // расталкивают карточку шире экрана.
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-primary)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', marginBottom: 4 }}>
            <Users size={18} />
            <span>{lang === 'ru' ? 'Управление клиентами и бонусами' : 'Mijozlar boshqaruvi'}</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)' }}>
            {lang === 'ru' ? 'База клиентов, B2B и лояльность' : 'Mijozlar bazasi va sodiqlik'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
            {lang === 'ru'
              ? 'Откройте клиента, чтобы увидеть историю заказов и обращений.'
              : 'Mijozni oching — buyurtmalar va murojaatlar tarixi ko‘rinadi.'}
          </p>
        </div>

        <button onClick={onRefresh} disabled={loading} className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>{lang === 'ru' ? 'Обновить' : 'Yangilash'}</span>
        </button>
      </div>

      {/* Ошибка загрузки. Раньше error присваивался, но не выводился нигде:
          при отказе API экран просто оставался пустым, и владелец видел
          «клиентов нет» вместо «список не загрузился». */}
      {error && (
        <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--error)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--error)' }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: 'var(--text-sm)' }}>{error.message}</span>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {/* position: relative обязателен — иконка внутри позиционируется от
            него. Именно её отсутствие роняло лупу под поле ввода. */}
        <form onSubmit={onSearch} style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={lang === 'ru' ? 'Поиск по имени, телефону, username…' : 'Qidiruv…'}
            style={{
              width: '100%',
              // Левый отступ освобождает место под иконку. Раньше он задавался
              // Tailwind-утилитой pl-9, которую съедал глобальный сброс.
              padding: 'var(--space-2) var(--space-3) var(--space-2) 32px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </form>

        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 2 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilter(f.value)}
              className={`btn btn-sm ${statusFilter === f.value ? 'btn-primary' : 'btn-ghost'}`}
              style={{ whiteSpace: 'nowrap' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
