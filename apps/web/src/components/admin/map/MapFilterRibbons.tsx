'use client';

import { CITY_META, CITY_SLUGS } from '@/lib/customers/districts';

import { useTheme } from '@/components/providers/ThemeProvider';

import { CategoryChips } from './CategoryChips';
import { COLORIZE_LABELS, COLORIZE_MODES } from './mapFeature';
import { hasDetailedBase } from './mapLayers';
import type { useCustomerMap } from './useCustomerMap';

// ══════════════════════════════════════════════════════════════════════
// Ленты чипов карты: кого показывать, что поверх и чем красить.
//
// Вынесены из CustomerMapToolbar, когда та вместе со сворачиванием и
// мультивыбором типов перестала помещаться в 200 строк. Здесь только
// разметка — ни одно решение не принимается.
//
// Три ленты, и порядок в них не случаен: сначала КТО (тип клиента и
// город), потом ЧТО ПОВЕРХ (слои), потом ЧЕМ КРАСИТЬ. Смена раскраски не
// перезапрашивает данные, а смена фильтра — да; путать эти два по цене
// действия не стоит.
// ══════════════════════════════════════════════════════════════════════

// b2b здесь — это ТИП КЛИЕНТА, а не тип заведения. Чип назывался
// «Рестораны», и это перестало быть правдой в тот день, когда справочник
// накрыл тойхоны, фитнес и отели: под ним теперь весь B2B области. Тип
// заведения спрашивается соседней лентой (CategoryChips).
const TYPES = [
  { value: 'all', ru: 'Все', uz: 'Barchasi' },
  { value: 'b2b', ru: 'B2B — заведения', uz: 'B2B — muassasalar' },
  { value: 'b2c', ru: 'Розница', uz: 'Chakana' },
];

const ribbon: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 2,
};

const caption: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  alignSelf: 'center',
  whiteSpace: 'nowrap',
};

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  /** Раскраска по выручке — только владельцу: продавцу суммы скрыты. */
  isOwner: boolean;
  /** Стиль чипа приходит из шапки: он там же и у остальных её кнопок. */
  chip: (active: boolean) => React.CSSProperties;
}

export function MapFilterRibbons({ lang, m, isOwner, chip }: Props) {
  const { theme } = useTheme();
  const {
    typeFilter,
    cityFilter,
    showProspects,
    showDelivery,
    showHeat,
    detailedBase,
    companyTypes,
    audience,
  } = m;
  const prospects = m.collection.summary.prospects;
  const routes = m.routes.length;
  // Тёмная подложка на нашем хосте подписей не прибавляет, а убавляет
  // (см. hasDetailedBase): предлагать там подробность значило бы обещать
  // то, чего стиль не везёт.
  const canDetail = hasDetailedBase(theme);
  // Режим «по выручке» продавцу не показывается; если он остался в
  // состоянии от прошлого владельца вкладки, показываем состояние.
  const mode = !isOwner && m.mode === 'revenue' ? 'state' : m.mode;
  return (
    <>
      {/* Ленты скроллятся по горизонтали: на телефоне они иначе переносятся
          в три ряда и съедают карту. */}
      <div style={ribbon}>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            style={chip(typeFilter === t.value)}
            onClick={() => m.setTypeFilter(t.value)}
          >
            {t[lang]}
          </button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} aria-hidden />
        <button type="button" style={chip(cityFilter === 'all')} onClick={() => m.setCityFilter('all')}>
          {lang === 'ru' ? 'Все города' : 'Barcha shaharlar'}
        </button>
        {CITY_SLUGS.map((slug) => (
          <button
            key={slug}
            type="button"
            style={chip(cityFilter === slug)}
            onClick={() => m.setCityFilter(slug)}
          >
            {CITY_META[slug][lang]}
          </button>
        ))}
      </div>

      <div style={ribbon}>
        <span style={caption}>{lang === 'ru' ? 'Поверх:' : 'Ustidan:'}</span>
        {/* Белые пятна: заведения из справочника, которым мы ещё не продали.
            Отдельный переключатель, а не фильтр — это другой вопрос к карте:
            не «как дела у клиентов», а «куда идти дальше». */}
        <button
          type="button"
          style={chip(showProspects)}
          onClick={() => m.setShowProspects(!showProspects)}
          aria-pressed={showProspects}
        >
          {lang === 'ru' ? 'Белые пятна' : 'Oq dogʻlar'}
          {showProspects && prospects !== undefined ? ` · ${prospects}` : ''}
        </button>
        {/* Маршруты на сегодня: отдельный слой поверх клиентов, со своим
            обновлением — объезд меняется в течение дня, клиенты неделями. */}
        <button
          type="button"
          style={chip(showDelivery)}
          onClick={() => m.setShowDelivery(!showDelivery)}
          aria-pressed={showDelivery}
        >
          {lang === 'ru' ? 'Доставка' : 'Yetkazish'}
          {showDelivery && routes > 0 ? ` · ${routes}` : ''}
        </button>
        {/* Тепло отвечает на вопрос, на который россыпь точек не отвечает:
            где густо и где деньги, то есть куда тянуть следующее
            направление доставки. Продавцу суммы замаскированы, и слой для
            него честно вырождается в плотность. */}
        <button
          type="button"
          style={chip(showHeat)}
          onClick={() => m.setShowHeat(!showHeat)}
          aria-pressed={showHeat}
        >
          {lang === 'ru' ? (isOwner ? 'Где деньги' : 'Где густо') : 'Zichlik'}
        </button>
        {/* Подложка: схема молчалива и не мешает точкам, подробная рисует
            названия улиц и здания. В незнакомом районе это разница между
            «где-то тут» и «вот этот дом». */}
        {canDetail && (
          <>
            <span style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} aria-hidden />
            <button
              type="button"
              style={chip(detailedBase)}
              onClick={() => m.setDetailedBase(!detailedBase)}
              aria-pressed={detailedBase}
            >
              {lang === 'ru' ? 'Подробная карта' : 'Batafsil xarita'}
            </button>
          </>
        )}
      </div>

      <CategoryChips
        lang={lang}
        companyTypes={companyTypes}
        onToggleType={m.toggleCompanyType}
        onToggleGroup={m.toggleCompanyGroup}
        onClearTypes={m.clearCompanyTypes}
        audience={audience}
        onAudience={m.setAudience}
        chip={chip}
      />

      <div style={ribbon}>
        <span style={caption}>{lang === 'ru' ? 'Раскрасить:' : 'Rang:'}</span>
        {COLORIZE_MODES.filter((c) => isOwner || c !== 'revenue').map((colorize) => (
          <button
            key={colorize}
            type="button"
            style={chip(mode === colorize)}
            onClick={() => m.setMode(colorize)}
          >
            {COLORIZE_LABELS[colorize][lang]}
          </button>
        ))}
      </div>
    </>
  );
}
