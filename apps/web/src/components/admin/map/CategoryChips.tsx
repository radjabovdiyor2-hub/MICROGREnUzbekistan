'use client';

import {
  AUDIENCES,
  AUDIENCE_META,
  AUDIENCE_RELEVANT,
  COMPANY_TYPE_GROUPS,
  GROUP_META,
  typesOfGroup,
} from '@/lib/customers/companyTypes';

// ══════════════════════════════════════════════════════════════════════
// Ленты «Тип заведения» и «Аудитория» для карты.
//
// Вынесены из CustomerMapToolbar: девятнадцать категорий тремя группами
// плюс лента аудитории — это полсотни строк разметки, а тулбар и без них
// подходил к потолку в 200 строк.
//
// Лента аудитории показывается не всегда, а только у категорий, где пол
// зала — рабочий вопрос (фитнес, спорт, тойхона). Постоянно висящий
// фильтр «женский / мужской» рядом с пекарней ничего не спрашивает и
// только занимает ряд на телефоне.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  companyType: string;
  onCompanyType: (value: string) => void;
  audience: string;
  onAudience: (value: string) => void;
  /** Стиль чипа — тот же, что у остальных лент тулбара. */
  chip: (active: boolean) => React.CSSProperties;
}

const ribbon: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 2,
  alignItems: 'center',
};

const caption: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export function CategoryChips({
  lang,
  companyType,
  onCompanyType,
  audience,
  onAudience,
  chip,
}: Props) {
  const showAudience = AUDIENCE_RELEVANT.includes(companyType);

  return (
    <>
      <div style={ribbon}>
        <span style={caption}>{lang === 'ru' ? 'Тип:' : 'Turi:'}</span>
        <button type="button" style={chip(companyType === 'all')} onClick={() => onCompanyType('all')}>
          {lang === 'ru' ? 'Все типы' : 'Barcha turlar'}
        </button>
        {COMPANY_TYPE_GROUPS.map((group) => (
          <span key={group} style={{ display: 'contents' }}>
            {/* Разделитель между группами: без него девятнадцать чипов
                читаются одной неразличимой лентой. */}
            <span
              style={{ width: 1, background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' }}
              aria-hidden
            />
            <span style={caption} title={GROUP_META[group][lang]}>
              {GROUP_META[group][lang]}
            </span>
            {typesOfGroup(group).map(({ slug, meta }) => (
              <button
                key={slug}
                type="button"
                style={chip(companyType === slug)}
                onClick={() => onCompanyType(slug)}
              >
                {meta[lang]}
              </button>
            ))}
          </span>
        ))}
      </div>

      {showAudience && (
        <div style={ribbon}>
          <span style={caption}>{lang === 'ru' ? 'Аудитория:' : 'Auditoriya:'}</span>
          <button type="button" style={chip(audience === 'all')} onClick={() => onAudience('all')}>
            {lang === 'ru' ? 'Любая' : 'Har qanday'}
          </button>
          {AUDIENCES.map((slug) => (
            <button
              key={slug}
              type="button"
              style={chip(audience === slug)}
              onClick={() => onAudience(slug)}
            >
              {AUDIENCE_META[slug][lang]}
            </button>
          ))}
          {/* «Не выяснено» — это рабочая очередь продавца, а не пустая
              категория: карточки, где пол зала ещё предстоит спросить. */}
          <button
            type="button"
            style={chip(audience === 'unknown')}
            onClick={() => onAudience('unknown')}
            title={
              lang === 'ru'
                ? 'Заведения, у которых аудитория ещё не выяснена'
                : 'Auditoriyasi hali aniqlanmagan joylar'
            }
          >
            {lang === 'ru' ? 'Не выяснено' : 'Aniqlanmagan'}
          </button>
        </div>
      )}
    </>
  );
}
