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
// Фильтры списка клиентов: тип заведения и аудитория.
//
// Селекты, а не лента чипов, как на карте: девятнадцать категорий лентой
// съедают весь экран списка. На карте лента оправдана — там она заменяет
// собой панель фильтров, и место под неё есть.
//
// Вынесено из AdminCustomersToolbar: тот упёрся в потолок 200 строк ровно
// на этих двух селектах.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  companyType: string;
  onCompanyType: (value: string) => void;
  audience: string;
  onAudience: (value: string) => void;
}

/** Селект на токенах — тот же вид, что у поля поиска рядом. */
const select: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  maxWidth: 200,
};

export function CustomerFilterSelects({
  lang,
  companyType,
  onCompanyType,
  audience,
  onAudience,
}: Props) {
  return (
    <>
      <select
        value={companyType}
        onChange={(e) => onCompanyType(e.target.value)}
        style={select}
        aria-label={lang === 'ru' ? 'Тип заведения' : 'Muassasa turi'}
      >
        <option value="all">{lang === 'ru' ? 'Все типы' : 'Barcha turlar'}</option>
        {COMPANY_TYPE_GROUPS.map((group) => (
          <optgroup key={group} label={GROUP_META[group][lang]}>
            {typesOfGroup(group).map(({ slug, meta }) => (
              <option key={slug} value={slug}>
                {meta[lang]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Аудитория спрашивается только там, где пол зала — рабочий вопрос.
          Селект «женский / мужской» рядом с пекарней ничего не уточняет. */}
      {AUDIENCE_RELEVANT.includes(companyType) && (
        <select
          value={audience}
          onChange={(e) => onAudience(e.target.value)}
          style={select}
          aria-label={lang === 'ru' ? 'Аудитория' : 'Auditoriya'}
        >
          <option value="all">{lang === 'ru' ? 'Любая аудитория' : 'Har qanday'}</option>
          {AUDIENCES.map((slug) => (
            <option key={slug} value={slug}>
              {AUDIENCE_META[slug][lang]}
            </option>
          ))}
          {/* «Не выяснено» — рабочая очередь продавца, а не пустая графа:
              заведения, у которых пол зала ещё предстоит спросить. */}
          <option value="unknown">{lang === 'ru' ? 'Не выяснено' : 'Aniqlanmagan'}</option>
        </select>
      )}
    </>
  );
}
