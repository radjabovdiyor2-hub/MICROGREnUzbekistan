'use client';

import { ChevronRight } from 'lucide-react';

import { cadenceIsPoor, cadenceMin } from '@/lib/tracking/cadence';
import { SILENT_MIN } from '@/lib/tracking/ping';

import { clock, humanDistance, sourceLabel } from './fieldDayTypes';
import type { LivePerson } from './livePeople';

// ══════════════════════════════════════════════════════════════════════
// Одна строка «кто в поле»: имя, чем день снят, и живая ли точка.
//
// СТРОКА — КНОПКА. Владелец смотрит на два имени и следующим движением
// тычет в то, за кем хочет посмотреть. Отдельная кнопка «следить» рядом с
// именем — лишний прицел на телефоне.
//
// ЧАСТОТА ТОЧЕК ЗДЕСЬ НЕ ДЛЯ КРАСОТЫ. «Раз в девять минут» при ожидаемых
// сорока пяти секундах — это ответ на вопрос «почему линия прямая»:
// сторож усыпляется системой. Без этой подписи прямую линию объясняли
// картой, а чинить надо телефон.
//
// МОЛЧАНИЕ СЕРЫМ, А НЕ КРАСНЫМ: это про связь, а не про человека. Красным
// здесь светил бы каждый подвал.
// ══════════════════════════════════════════════════════════════════════

const cell: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
};

export function FieldPersonRow({
  person,
  silentMin,
  lang,
  onWatch,
}: {
  person: LivePerson;
  /** Молчание, состаренное на клиенте: серверное число к этому моменту устарело. */
  silentMin: number | null;
  lang: 'ru' | 'uz';
  onWatch: () => void;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const stale = (silentMin ?? 0) > SILENT_MIN;

  const spanMs = person.last
    ? new Date(person.last.at).getTime() - new Date(person.startedAt).getTime()
    : 0;
  const cadence = cadenceMin(person.points, spanMs);

  return (
    <button
      type="button"
      onClick={onWatch}
      id={`field-person-${person.id}`}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        width: '100%',
        textAlign: 'left',
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontWeight: 'var(--font-semibold)' }}>{person.name}</span>

      <span style={cell}>
        {t('с', 'dan')} {clock(person.startedAt)}
        {' · '}
        {humanDistance(person.meters)}
        {' · '}
        {person.stops} {t('заездов', 'toʻxtash')}
      </span>

      {/* Чем снят день и как часто приходят точки — рядом, потому что
          вместе они и объясняют рваный трек. */}
      {person.lastSource !== null && (
        <span style={cell}>
          {sourceLabel(person.lastSource, lang)}
          {cadence !== null && (
            <span style={{ color: cadenceIsPoor(cadence) ? 'var(--text-primary)' : undefined }}>
              {' · '}
              {t(`раз в ${cadence} мин`, `${cadence} daqiqada bir`)}
            </span>
          )}
        </span>
      )}

      <span
        style={{
          ...cell,
          marginLeft: 'auto',
          color: silentMin === null || stale ? 'var(--text-secondary)' : 'var(--brand-primary)',
        }}
      >
        {/* «Точек нет» — это не поломка и не молчание связи: человек
            отметился в админке, но день не пишет НИЧЕМ. Способа три, и
            назвать один из них значило бы послать чинить не то. */}
        {silentMin === null
          ? t('запись дня не включена', 'kun yozuvi yoqilmagan')
          : stale
            ? t(`молчит ${silentMin} мин`, `${silentMin} daq jim`)
            : t('на связи', 'aloqada')}
      </span>

      <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
    </button>
  );
}
