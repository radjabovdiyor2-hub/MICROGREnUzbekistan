'use client';

import { useCallback, useEffect } from 'react';
import { Layers, MapPinOff, Route, SlidersHorizontal, X } from 'lucide-react';

import { useAdminBack } from '../useAdminBack';
import { MapFilterRibbons } from './MapFilterRibbons';
import { activeFilterCount, chipStyle } from './mapChrome';
import { DistrictsPanel, LegendPanel, PointPanel, RoutePanel, TrayPanel } from './mapPanels';
import type { useCustomerMap } from './useCustomerMap';
import type { useDayRoute } from './useDayRoute';

// ══════════════════════════════════════════════════════════════════════
// Док полноэкранного режима.
//
// ЗАЧЕМ. Первая версия полного экрана делала карту больше и при этом
// отнимала всё остальное: легенда, объезд, районы, лоток и фильтры
// оставались в боковой колонке ПОД накрывшей их сценой. То есть режим,
// сделанный для поля, лишал ровно тех панелей, которыми в поле и
// пользуются, — «кому пора», «куда я сегодня еду», «кого ещё не поставил
// на карту». Большая карта без инструментов — не полноэкранный режим.
//
// КАК. Полоса кнопок снизу и лист над ней. Панели те же самые, что в
// колонке (mapPanels.tsx), а не их урезанные копии.
//
// ПОРЯДОК ЛИСТА. Открытая вкладка перекрывает карточку точки, но выбор с
// точки НЕ снимает: её кольцо остаётся на карте, и закрытие вкладки
// возвращает карточку. Иначе взгляд на легенду стоил бы потери выбранного
// клиента — а выбирают его пальцем по шестипиксельной точке.
// ══════════════════════════════════════════════════════════════════════

export type DockTab = 'filters' | 'legend' | 'route' | 'tray';

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  route: ReturnType<typeof useDayRoute>;
  isOwner: boolean;
  onOpenCard: (id: number) => void;
  sellerName: string;
  tab: DockTab | null;
  onTab: (tab: DockTab | null) => void;
}

const LABEL: Record<DockTab, { ru: string; uz: string }> = {
  filters: { ru: 'Фильтры', uz: 'Filtrlar' },
  legend: { ru: 'Легенда', uz: 'Izoh' },
  route: { ru: 'Объезд', uz: 'Yoʻnalish' },
  // Короткое: «Без координат · 12» не влезало в четверть ширины телефона
  // и обрезалось многоточием ровно на числе, ради которого кнопку и видно.
  tray: { ru: 'Без пина', uz: 'Pinsiz' },
};

const ICON: Record<DockTab, typeof Layers> = {
  filters: SlidersHorizontal,
  legend: Layers,
  route: Route,
  tray: MapPinOff,
};

const TABS: DockTab[] = ['filters', 'legend', 'route', 'tray'];

export function MapDock({
  lang,
  m,
  route,
  isOwner,
  onOpenCard,
  sellerName,
  tab,
  onTab,
}: Props) {
  // Стабильная ссылка обязательна: useAdminBack пересоздаёт запись в
  // стопке возвратов при каждой смене обработчика, а стопка — порядок
  // выхода. Новая функция на каждый рендер молча поднимала бы док наверх
  // стопки, обгоняя карточку точки.
  const close = useCallback(() => onTab(null), [onTab]);

  // Аппаратное «назад» и Esc закрывают вкладку раньше, чем режим: стопка
  // работает по принципу «последний вошёл — первый вышел», а эффекты детей
  // выполняются раньше родительских — карточка точки встаёт в стопку до
  // дока, и потому «назад» закрывает сначала вкладку, потом её.
  useAdminBack(close, tab !== null);

  // Уходя, док уносит и свою вкладку: вернуться в обычный вид с открытым
  // листом значило бы увидеть его поверх страницы, а при следующем входе
  // в режим — лист, которого никто не звал.
  useEffect(() => () => close(), [close]);

  useEffect(() => {
    if (tab === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, close]);

  const counts: Record<DockTab, number> = {
    filters: activeFilterCount(m),
    legend: 0,
    route: route.stops.length,
    tray: m.queue.length,
  };

  const sheet = tab ?? (m.selected ? 'point' : null);

  return (
    <div className="admin-map-dock">
      {sheet !== null && (
        <div className="admin-map-dock-sheet">
          <div className="admin-map-dock-sheet-head">
            <span style={{ flex: 1, fontWeight: 'var(--font-semibold)' }}>
              {tab ? LABEL[tab][lang] : (m.selected?.name ?? '')}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => (tab ? onTab(null) : m.setSelectedId(null))}
              aria-label={lang === 'ru' ? 'Закрыть' : 'Yopish'}
              style={{ minWidth: 44 }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="admin-map-dock-sheet-body">
            {tab === 'filters' && (
              <>
                <MapFilterRibbons lang={lang} m={m} isOwner={isOwner} chip={chipStyle} />
                <DistrictsPanel lang={lang} m={m} />
              </>
            )}
            {tab === 'legend' && <LegendPanel lang={lang} m={m} />}
            {tab === 'route' && <RoutePanel lang={lang} m={m} route={route} />}
            {tab === 'tray' && <TrayPanel lang={lang} m={m} isOwner={isOwner} />}
            {tab === null && (
              <PointPanel
                lang={lang}
                m={m}
                route={route}
                onOpenCard={onOpenCard}
                sellerName={sellerName}
              />
            )}
          </div>
        </div>
      )}

      <div className="admin-map-dock-bar">
        {TABS.map((id) => {
          const Icon = ICON[id];
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              className="admin-map-dock-btn"
              aria-pressed={active}
              onClick={() => onTab(active ? null : id)}
              style={{
                color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
              }}
            >
              <Icon size={18} />
              <span>
                {LABEL[id][lang]}
                {counts[id] > 0 ? ` · ${counts[id]}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
