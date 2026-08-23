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
// ── Две РАЗНЫЕ оси, а не один ряд ───────────────────────────────────
//
// Раньше здесь лежало вперемешку: «Все, Лиды, Активные, VIP, B2B, Ушедшие».
// B2B — это не статус, а тип клиента, и подстановка его в `where.status`
// давала пустой список: статуса «b2b» в базе не бывает. Дефект чинили
// заменой на сервере, но причина оставалась — одна ось на два вопроса.
//
// Пока выбор был одиночным, путаница была терпимой. Множественный выбор
// её обнажает: «VIP + B2B» — это «VIP и B2B» или «VIP или B2B»? Пока оси
// разделены, ответ очевиден: статусы складываются через ИЛИ, а между собой
// оси — через И. «Активные B2B» — обычный вопрос, на который прежний
// фильтр не мог ответить вовсе.

/** Статусы отношений. Пустой набор = все. */
export const STATUS_FILTERS = [
  { value: 'lead', ru: 'Лиды', uz: 'Lidlar' },
  { value: 'active', ru: 'Активные', uz: 'Faol' },
  { value: 'vip', ru: 'VIP', uz: 'VIP' },
  { value: 'churned', ru: 'Ушедшие', uz: 'Ketganlar' },
] as const;

/** Тип клиента — вторая ось. Оба выбранных = не фильтровать вовсе. */
export const TYPE_FILTERS = [
  { value: 'b2b', ru: 'B2B — заведения', uz: 'B2B — muassasa' },
  { value: 'b2c', ru: 'Розница', uz: 'Chakana' },
] as const;

interface Props {
  lang: 'ru' | 'uz';
  loading: boolean;
  error: Error | null;
  searchInput: string;
  setSearchInput: (v: string) => void;
  onSearch: (e: React.FormEvent) => void;
  /** Выбранные статусы. Пустой набор — все. */
  statuses: Set<string>;
  onToggleStatus: (value: string) => void;
  onClearStatuses: () => void;
  /** Выбранные типы клиента. Пустой набор — все. */
  types: Set<string>;
  onToggleType: (value: string) => void;
  onClearTypes: () => void;
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
  onSearch, statuses, onToggleStatus, onClearStatuses,
  types, onToggleType, onClearTypes, onRefresh, view, onView,
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

        {/* Статусы: несколько разом. «Лиды + активные» — обычный вопрос,
            на который прежний одиночный фильтр ответить не мог. */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {lang === 'ru' ? 'Статус:' : 'Holat:'}
          </span>
          <button
            onClick={onClearStatuses}
            className={`btn btn-sm ${statuses.size === 0 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {lang === 'ru' ? 'Все' : 'Barchasi'}
          </button>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onToggleStatus(f.value)}
              aria-pressed={statuses.has(f.value)}
              className={`btn btn-sm ${statuses.has(f.value) ? 'btn-primary' : 'btn-ghost'}`}
              style={{ whiteSpace: 'nowrap' }}
            >
              {f[lang]}
            </button>
          ))}
        </div>

        {/* Тип клиента — вторая ось. Складывается со статусом через И:
            «активные B2B» это статус И тип, а не «или». */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {lang === 'ru' ? 'Кто:' : 'Kim:'}
          </span>
          <button
            onClick={onClearTypes}
            className={`btn btn-sm ${types.size === 0 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {lang === 'ru' ? 'Все' : 'Barchasi'}
          </button>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onToggleType(f.value)}
              aria-pressed={types.has(f.value)}
              className={`btn btn-sm ${types.has(f.value) ? 'btn-primary' : 'btn-ghost'}`}
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
