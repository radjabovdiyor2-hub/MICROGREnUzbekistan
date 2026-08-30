'use client';

import {
  AUDIENCES,
  AUDIENCE_META,
  AUDIENCE_RELEVANT,
  COMPANY_TYPE_GROUPS,
  GROUP_META,
  typesOfGroup,
  type CompanyTypeGroup,
} from '@/lib/customers/companyTypes';

// ══════════════════════════════════════════════════════════════════════
// Ленты «Тип заведения» и «Аудитория» для карты.
//
// Вынесены из CustomerMapToolbar: пятнадцать категорий тремя группами
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
  /** Выбранные типы. Пустой набор — все. */
  companyTypes: Set<string>;
  onToggleType: (value: string) => void;
  /** Вся группа разом: общепит, гостиницы, спорт. */
  onToggleGroup: (group: CompanyTypeGroup) => void;
  onClearTypes: () => void;
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
  companyTypes,
  onToggleType,
  onToggleGroup,
  onClearTypes,
  audience,
  onAudience,
  chip,
}: Props) {
  // Аудиторию показываем, когда выбран РОВНО один подходящий тип. При
  // нескольких вопрос «женский зал или мужской» теряет смысл: он про
  // фитнес, а не про кафе, попавшее в тот же выбор.
  const only = companyTypes.size === 1 ? [...companyTypes][0] : '';
  const showAudience = AUDIENCE_RELEVANT.includes(only);

  /** Выбрана ли группа целиком — от этого зависит вид её кнопки. */
  const wholeGroup = (group: CompanyTypeGroup): boolean => {
    const slugs = typesOfGroup(group).map((t) => t.slug);
    return slugs.length > 0 && slugs.every((slug) => companyTypes.has(slug));
  };

  return (
    <>
      <div style={ribbon}>
        <span style={caption}>{lang === 'ru' ? 'Тип:' : 'Turi:'}</span>
        {/* «Все типы» — не шестнадцатый тип, а снятие выбора: пустой набор
            и означает «все». Иначе его пришлось бы исключать вручную в
            каждом месте, где набор читается. */}
        <button type="button" style={chip(companyTypes.size === 0)} onClick={onClearTypes}>
          {lang === 'ru' ? 'Все типы' : 'Barcha turlar'}
        </button>
        {COMPANY_TYPE_GROUPS.map((group) => (
          <span key={group} style={{ display: 'contents' }}>
            {/* Разделитель между группами: без него пятнадцать чипов
                читаются одной неразличимой лентой. */}
            <span
              style={{ width: 1, background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' }}
              aria-hidden
            />
            {/* Группа — КНОПКА, а не подпись. «Покажи весь общепит» стоило
                четырнадцати нажатий подряд, и каждое перезапрашивало карту.
                Нажата, только когда выбрана ВСЯ группа: иначе она горела бы
                от одного кафе и врала про свой охват. */}
            <button
              type="button"
              aria-pressed={wholeGroup(group)}
              style={{ ...chip(wholeGroup(group)), fontWeight: 'var(--font-semibold)' }}
              onClick={() => onToggleGroup(group)}
              title={
                lang === 'ru'
                  ? `Выбрать все: ${GROUP_META[group].ru.toLowerCase()}`
                  : GROUP_META[group].uz
              }
            >
              {GROUP_META[group][lang]}
            </button>
            {typesOfGroup(group).map(({ slug, meta }) => (
              <button
                key={slug}
                type="button"
                // Выбор нескольких: рестораны, кафе и чайханы — один
                // разговор, а смотреть их приходилось по очереди.
                aria-pressed={companyTypes.has(slug)}
                style={chip(companyTypes.has(slug))}
                onClick={() => onToggleType(slug)}
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
