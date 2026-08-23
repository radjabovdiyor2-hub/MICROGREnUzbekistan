'use client';

import { RefreshCw } from 'lucide-react';

import { CITY_META, CITY_SLUGS } from '@/lib/customers/districts';

import { CategoryChips } from './CategoryChips';
import { COLORIZE_LABELS, COLORIZE_MODES, type ColorizeMode } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Панель карты: чем красить, кого показывать, когда обновлялось.
//
// Смена раскраски НЕ перезапрашивает данные — меняются только paint-
// свойства слоя. Поэтому переключатель стоит рядом с картой, а не среди
// фильтров: это разные по цене действия, и путать их не стоит.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  mode: ColorizeMode;
  onMode: (mode: ColorizeMode) => void;
  typeFilter: string;
  onType: (value: string) => void;
  cityFilter: string;
  onCity: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
  placed: number;
  total: number;
  updatedAt: number;
  showProspects: boolean;
  onProspects: (value: boolean) => void;
  prospects?: number;
  showDelivery: boolean;
  onDelivery: (value: boolean) => void;
  routes: number;
  companyTypes: Set<string>;
  onToggleType: (value: string) => void;
  onClearTypes: () => void;
  audience: string;
  onAudience: (value: string) => void;
  /** Раскраска по выручке — только владельцу: продавцу суммы скрыты. */
  isOwner: boolean;
}

// b2b здесь — это ТИП КЛИЕНТА, а не тип заведения. Чип назывался
// «Рестораны», и это перестало быть правдой в тот день, когда справочник
// накрыл тойхоны, фитнес и отели: под ним теперь весь B2B области. Тип
// заведения спрашивается соседней лентой (CategoryChips).
const TYPES = [
  { value: 'all', ru: 'Все', uz: 'Barchasi' },
  { value: 'b2b', ru: 'B2B — заведения', uz: 'B2B — muassasalar' },
  { value: 'b2c', ru: 'Розница', uz: 'Chakana' },
];

const chip = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 'var(--radius-full)',
  border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border)'}`,
  background: active ? 'var(--brand-primary)' : 'transparent',
  color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

export function CustomerMapToolbar({
  lang,
  mode,
  onMode,
  typeFilter,
  onType,
  cityFilter,
  onCity,
  loading,
  onRefresh,
  placed,
  total,
  updatedAt,
  showProspects,
  onProspects,
  prospects,
  showDelivery,
  onDelivery,
  routes,
  companyTypes,
  onToggleType,
  onClearTypes,
  audience,
  onAudience,
  isOwner,
}: Props) {
  const stamp = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';

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
        <button type="button" className="btn btn-sm btn-ghost" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          {lang === 'ru' ? 'Обновить' : 'Yangilash'}
        </button>
      </div>

      {/* Ленты чипов скроллятся по горизонтали: на телефоне они иначе
          переносятся в три ряда и съедают карту. */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 2 }}>
        {TYPES.map((t) => (
          <button key={t.value} type="button" style={chip(typeFilter === t.value)} onClick={() => onType(t.value)}>
            {t[lang]}
          </button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} aria-hidden />
        <button type="button" style={chip(cityFilter === 'all')} onClick={() => onCity('all')}>
          {lang === 'ru' ? 'Все города' : 'Barcha shaharlar'}
        </button>
        {CITY_SLUGS.map((slug) => (
          <button key={slug} type="button" style={chip(cityFilter === slug)} onClick={() => onCity(slug)}>
            {CITY_META[slug][lang]}
          </button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} aria-hidden />
        {/* Белые пятна: заведения из справочника, которым мы ещё не продали.
            Отдельный переключатель, а не фильтр — это другой вопрос к карте:
            не «как дела у клиентов», а «куда идти дальше». */}
        <button
          type="button"
          style={chip(showProspects)}
          onClick={() => onProspects(!showProspects)}
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
          onClick={() => onDelivery(!showDelivery)}
          aria-pressed={showDelivery}
        >
          {lang === 'ru' ? 'Доставка' : 'Yetkazish'}
          {showDelivery && routes > 0 ? ` · ${routes}` : ''}
        </button>
      </div>

      <CategoryChips
        lang={lang}
        companyTypes={companyTypes}
        onToggleType={onToggleType}
        onClearTypes={onClearTypes}
        audience={audience}
        onAudience={onAudience}
        chip={chip}
      />

      <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 2 }}>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            alignSelf: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {lang === 'ru' ? 'Раскрасить:' : 'Rang:'}
        </span>
        {COLORIZE_MODES.filter((m) => isOwner || m !== 'revenue').map((m) => (
          <button key={m} type="button" style={chip(mode === m)} onClick={() => onMode(m)}>
            {COLORIZE_LABELS[m][lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
