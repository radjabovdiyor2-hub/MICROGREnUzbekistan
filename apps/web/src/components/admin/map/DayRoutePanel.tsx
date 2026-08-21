'use client';

import { ArrowDown, ArrowUp, Navigation, Route, Trash2, X } from 'lucide-react';

import { MAX_STOPS, routeLengthKm, type RoutePoint } from '@/lib/customers/dayRoute';
import { NAV_APP_KEY, buildMultiStopUrl, navApp } from '@/lib/customers/navigation';

// ══════════════════════════════════════════════════════════════════════
// Объезд на сегодня: список остановок и одна кнопка «вести».
//
// Порядок правится руками, а «по близости» — это КНОПКА, а не автоматика.
// Молча переставленный маршрут ломает замысел: человек знает про обед на
// кухне и про то, что к одним лучше заезжать с утра. Та же причина, по
// которой линия доставки строится строго по orderIndex.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  stops: RoutePoint[];
  from: RoutePoint | null;
  onRemove: (id: number) => void;
  onMove: (id: number, delta: -1 | 1) => void;
  onSort: () => void;
  onClear: () => void;
  onPick: (stop: RoutePoint) => void;
}

const text = {
  title: { ru: 'Объезд на сегодня', uz: 'Bugungi yoʻnalish' },
  empty: {
    ru: 'Пусто. Откройте точку на карте и нажмите «В объезд».',
    uz: 'Boʻsh. Xaritada nuqtani oching va «Yoʻnalishga» bosing.',
  },
  sort: { ru: 'По близости', uz: 'Yaqinlik boʻyicha' },
  clear: { ru: 'Очистить', uz: 'Tozalash' },
  go: { ru: 'Вести по объезду', uz: 'Yoʻnalish boʻyicha olib borish' },
  full: { ru: `Больше ${MAX_STOPS} в один заход не поедет`, uz: `${MAX_STOPS} tadan koʻp emas` },
  noMulti: {
    ru: 'Выбранное приложение объезд не строит — весь маршрут умеют Яндекс и Google',
    uz: 'Tanlangan ilova koʻp nuqtali yoʻnalishni qurmaydi — Yandex yoki Google tanlang',
  },
};

export function DayRoutePanel({
  lang,
  stops,
  from,
  onRemove,
  onMove,
  onSort,
  onClear,
  onPick,
}: Props) {
  if (stops.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-semibold)' }}>
          <Route size={16} /> {text.title[lang]}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {text.empty[lang]}
        </p>
      </div>
    );
  }

  // Приложение читаем прямо перед переходом: выбор мог смениться в панели
  // точки, и держать его копию здесь значило бы вести не тем навигатором.
  const appId =
    typeof window === 'undefined' ? '' : navApp(window.localStorage.getItem(NAV_APP_KEY)).id;
  const link = buildMultiStopUrl(appId, stops);
  const km = routeLengthKm(stops, from);

  return (
    <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Route size={16} />
        <span style={{ fontWeight: 'var(--font-semibold)', flex: 1 }}>
          {text.title[lang]} · {stops.length}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          ≈ {km.toFixed(1)} км
        </span>
      </div>

      <ol style={{ display: 'grid', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
        {stops.map((stop, at) => (
          <li key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                fontSize: 'var(--text-xs)',
              }}
            >
              {at + 1}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onPick(stop)}
              style={{
                flex: 1,
                minWidth: 0,
                justifyContent: 'flex-start',
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {stop.name}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onMove(stop.id, -1)}
              disabled={at === 0}
              aria-label="Выше"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onMove(stop.id, 1)}
              disabled={at === stops.length - 1}
              aria-label="Ниже"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onRemove(stop.id)}
              aria-label="Убрать"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ol>

      {stops.length >= MAX_STOPS && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)' }}>{text.full[lang]}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onSort}>
          {text.sort[lang]}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}>
          <Trash2 size={14} /> {text.clear[lang]}
        </button>
      </div>

      {link ? (
        <a
          className="btn btn-primary"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          style={{ minHeight: 44, fontWeight: 'var(--font-semibold)' }}
        >
          <Navigation size={16} /> {text.go[lang]}
        </a>
      ) : (
        // 2ГИС промежуточные точки в ссылке не принимает. Подсунуть ему
        // конечную вместо объезда значило бы отправить курьера к последнему
        // адресу мимо всех остальных.
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)' }}>
          {text.noMulti[lang]}
        </div>
      )}
    </div>
  );
}
