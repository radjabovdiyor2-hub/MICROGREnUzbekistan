'use client';

import { useState, type ReactNode } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';

import { PlacingBanner } from './PlacingBanner';
import type { useCustomerMap } from './useCustomerMap';

// ══════════════════════════════════════════════════════════════════════
// Всё, что лежит поверх карты сверху слева.
//
// ЧТО БЫЛО НЕ ТАК В ПОЛНОМ ЭКРАНЕ. Поиск висел там развёрнутой карточкой
// на 360 px, а под ней — лента быстрых наборов и выпадающий список на
// 280 px. То есть режим, который включают ради большой карты, отдавал
// верхнюю треть под поле ввода, в которое обращаются раз в день.
//
// «ОБНОВИТЬ» В ПОЛНОМ ЭКРАНЕ НЕ БЫЛО ВОВСЕ. Кнопка живёт в шапке, а шапка
// в этом режиме не видна: карта обновлялась только сама по себе, и
// сверить её с только что записанным заказом было нечем.
//
// Поэтому здесь компактная полоса: лупа и обновление. Поиск раскрывается
// по нажатию и сам закрывается, когда точка выбрана, — открытым он снова
// съедал бы карту.
//
// В обычном режиме поиск стоит в потоке страницы и сюда не попадает: там
// он ничего не закрывает.
// ══════════════════════════════════════════════════════════════════════

const label = {
  search: { ru: 'Поиск', uz: 'Qidiruv' },
  close: { ru: 'Закрыть поиск', uz: 'Qidiruvni yopish' },
  refresh: { ru: 'Обновить', uz: 'Yangilash' },
};

interface Props {
  lang: 'ru' | 'uz';
  isFull: boolean;
  /** Готовый блок поиска — тот же самый, что в потоке страницы. */
  search: ReactNode;
  /** Открыт ли поиск, и как его закрыть снаружи (после выбора точки). */
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  /** Состояние карты приходит объектом — как в панелях и шапке. */
  m: ReturnType<typeof useCustomerMap>;
}

const iconBtn: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function MapOverlayTop({ lang, isFull, search, searchOpen, onSearchOpen, m }: Props) {
  const placing = m.placingId !== null;
  if (!isFull && !placing) return null;

  // Кому ставим пин. Имя ищем в обоих списках: у клиента без координат оно
  // лежит в очереди лотка, у того, кому пин переставляют, — среди точек.
  const placingName = !placing
    ? null
    : (m.collection.features.find((f) => f.id === m.placingId)?.properties.n
      ?? m.queue.find((c) => c.id === m.placingId)?.name
      ?? null);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', justifyItems: 'start', width: '100%' }}>
      {placing && (
        <PlacingBanner
          name={placingName}
          lang={lang}
          chaining={m.chaining}
          onCancel={m.stopChain}
        />
      )}

      {isFull && !searchOpen && (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="card btn btn-ghost"
            style={iconBtn}
            aria-label={label.search[lang]}
            onClick={() => onSearchOpen(true)}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className="card btn btn-ghost"
            style={iconBtn}
            aria-label={label.refresh[lang]}
            title={label.refresh[lang]}
            onClick={() => m.refetch()}
            disabled={m.isLoading}
          >
            <RefreshCw size={18} className={m.isLoading ? 'animate-spin' : undefined} />
          </button>
        </div>
      )}

      {isFull && searchOpen && (
        <div className="card" style={{ padding: 'var(--space-2)', width: 'min(360px, 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onSearchOpen(false)}
              aria-label={label.close[lang]}
            >
              <X size={14} />
            </button>
          </div>
          {search}
        </div>
      )}
    </div>
  );
}

/** Открыт ли поиск в полном экране. Живёт рядом с самим оверлеем. */
export function useSearchOpen() {
  return useState(false);
}
