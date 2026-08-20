'use client';

import { AlertCircle, List, MapPin, RefreshCw, Search, Users } from 'lucide-react';

import { CustomerFilterSelects } from './CustomerFilterSelects';

// Шапка раздела «Клиенты», сообщение об отказе загрузки, поиск и фильтры.
// Вынесено из AdminCustomers: тот перерос 200 строк, когда к списку
// добавилась карточка клиента.

// Значения соответствуют колонкам базы: lead/active/vip — это `status`,
// b2b — это `customer_type`. Прежний набор содержал «client», статуса с таким
// именем не существует вовсе, и кнопка всегда отдавала пустой список.
//
// `churned` добавлен последним: этот статус можно было поставить в правке
// клиента, но нельзя отфильтровать — единственное состояние без своей кнопки.
export const FILTERS = [
  { value: 'all', ru: 'Все', uz: 'Barchasi' },
  { value: 'lead', ru: 'Лиды', uz: 'Lidlar' },
  { value: 'active', ru: 'Активные', uz: 'Faol' },
  { value: 'vip', ru: 'VIP', uz: 'VIP' },
  { value: 'b2b', ru: 'B2B', uz: 'B2B' },
  { value: 'churned', ru: 'Ушедшие', uz: 'Ketganlar' },
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
  view: 'list' | 'map';
  onView: (view: 'list' | 'map') => void;
  companyTypeFilter: string;
  onCompanyType: (value: string) => void;
  audienceFilter: string;
  onAudience: (value: string) => void;
}

export function AdminCustomersToolbar({
  lang, loading, error, searchInput, setSearchInput,
  onSearch, statusFilter, onFilter, onRefresh, view, onView,
  companyTypeFilter, onCompanyType, audienceFilter, onAudience,
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {/* Список и карта — два вида ОДНОГО раздела, а не две вкладки:
              фильтры, поиск и карточка клиента у них общие. */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', padding: 3, borderRadius: 'var(--radius-md)' }}>
            <button
              onClick={() => onView('list')}
              className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <List size={15} />
              <span>{lang === 'ru' ? 'Список' : 'Roʻyxat'}</span>
            </button>
            <button
              onClick={() => onView('map')}
              className={`btn btn-sm ${view === 'map' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <MapPin size={15} />
              <span>{lang === 'ru' ? 'Карта' : 'Xarita'}</span>
            </button>
          </div>

          <button onClick={onRefresh} disabled={loading} className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>{lang === 'ru' ? 'Обновить' : 'Yangilash'}</span>
          </button>
        </div>
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

      {/* Поиск и фильтры — только для списка. У карты свой набор фильтров
          (тип, город, состояние), и показывать рядом два несвязанных
          набора значит гарантировать вопрос «почему фильтр не сработал». */}
      {view === 'list' && (
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

        <CustomerFilterSelects
          lang={lang}
          companyType={companyTypeFilter}
          onCompanyType={onCompanyType}
          audience={audienceFilter}
          onAudience={onAudience}
        />

        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 2 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilter(f.value)}
              className={`btn btn-sm ${statusFilter === f.value ? 'btn-primary' : 'btn-ghost'}`}
              style={{ whiteSpace: 'nowrap' }}
            >
              {f[lang]}
            </button>
          ))}
        </div>
      </div>
      )}
    </>
  );
}
