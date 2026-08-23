'use client';

import { ChevronDown, ChevronUp, RefreshCw, SlidersHorizontal } from 'lucide-react';

import { MapFilterRibbons } from './MapFilterRibbons';
import { activeFilterCount, chipStyle } from './mapChrome';
import type { useCustomerMap } from './useCustomerMap';

// ══════════════════════════════════════════════════════════════════════
// Шапка карты: сколько точек, когда обновлялось — и фильтры под ней.
//
// Фильтры сворачиваются. Четыре ленты чипов занимали до трёхсот пикселей
// над картой, и на телефоне до самой карты приходилось доскроллить — а
// смотрят на неё гораздо чаще, чем меняют фильтры.
//
// Развёрнуты ПО УМОЛЧАНИЮ: то же решение, что принято для групп вкладок —
// свернуть должен быть выбор человека, иначе фильтры становятся тайным
// знанием. Выбор запоминается, чтобы не повторять его каждое утро.
//
// Состояние карты приходит одним объектом, как и в MapSidebar: два
// десятка пропсов по одному — это два десятка мест, где их можно
// перепутать местами, и ни одного, где это заметит компилятор.
//
// Чип и счётчик активных фильтров — в mapChrome.ts: те же самые нужны
// доку полноэкранного режима.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  /** Раскраска по выручке и суммы — только владельцу. */
  isOwner: boolean;
  /** Фильтры развёрнуты. */
  open: boolean;
  onToggleOpen: () => void;
}

export function CustomerMapToolbar({ lang, m, isOwner, open, onToggleOpen }: Props) {
  const { placed, total } = m.collection.summary;
  const stamp = m.dataUpdatedAt
    ? new Date(m.dataUpdatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const active = activeFilterCount(m);

  return (
    <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 'var(--font-semibold)' }}>
            {lang === 'ru' ? 'Карта клиентов' : 'Mijozlar xaritasi'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {lang === 'ru' ? `На карте ${placed} из ${total}` : `${total} dan ${placed} ta`}
            {' · '}
            {lang === 'ru' ? 'данные на' : 'maʼlumot'} {stamp}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onToggleOpen}
          aria-expanded={open}
        >
          <SlidersHorizontal size={14} />
          {lang === 'ru' ? 'Фильтры' : 'Filtrlar'}
          {active > 0 ? ` · ${active}` : ''}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => m.refetch()}
          disabled={m.isLoading}
        >
          <RefreshCw size={14} className={m.isLoading ? 'animate-spin' : undefined} />
          {lang === 'ru' ? 'Обновить' : 'Yangilash'}
        </button>
      </div>

      {open && <MapFilterRibbons lang={lang} m={m} isOwner={isOwner} chip={chipStyle} />}
    </div>
  );
}
