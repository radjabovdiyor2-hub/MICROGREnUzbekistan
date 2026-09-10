'use client';

import { clock, humanDistance, humanDuration, type FieldDayHead, type FieldIdle } from './fieldDayTypes';

// ══════════════════════════════════════════════════════════════════════
// Полоса чисел над картой: чем был день.
//
// ВЫНЕСЕНА ИЗ КОНТЕЙНЕРА, потому что чисел стало шесть: `AdminFieldDay`
// упирался в 200 строк.
//
// ДВА НОВЫХ ЧИСЛА — РАЗНЫЕ ПО СМЫСЛУ, И ЭТО ГЛАВНОЕ ЗДЕСЬ.
//   · «простоев» — человек на связи и стоит не у клиента. Вопрос к нему;
//   · «связь пропадала» — крошек не было вовсе. Чаще вопрос к телефону.
// Свести их в одно «бездействие» значит спросить не о том и не у того:
// подвал и обед выглядели бы одинаково.
//
// ЦВЕТОМ НЕ СВЕТИМ НИ ОДНО. Сорок минут на месте объясняются очередью,
// поломкой и обедом; красным в этом проекте светится только явное
// расхождение с эталоном (см. `FieldDayTimeline`).
// ══════════════════════════════════════════════════════════════════════

export function FieldDaySummary({
  day,
  idle,
  gaps,
  lang,
}: {
  day: FieldDayHead;
  idle: FieldIdle[];
  gaps: number;
  lang: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const idleSec = idle.reduce((sum, w) => sum + w.idleSec, 0);

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        padding: 'var(--space-3)',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-4)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span>
        {t('Смена', 'Smena')}: {clock(day.startedAt)}
        {day.endedAt ? `–${clock(day.endedAt)}` : ''}
      </span>
      <span>
        {t('Пройдено', 'Bosib o‘tilgan')}: {humanDistance(day.meters)}
      </span>
      <span>
        {t('В движении', 'Harakatda')}: {humanDuration(day.movingSec, lang)}
      </span>
      <span>
        {t('Заездов', 'To‘xtashlar')}: {day.stops}
      </span>
      {/* Ноль простоев не показываем: строка «простоев: 0» превращает
          отсутствие вопроса в ещё одно число на экране. */}
      {idle.length > 0 && (
        <span style={{ color: 'var(--text-secondary)' }}>
          {t('Простоев', 'Bo‘sh turish')}: {idle.length} · {humanDuration(idleSec, lang)}
        </span>
      )}
      {gaps > 0 && (
        <span style={{ color: 'var(--text-secondary)' }}>
          {t('Связь пропадала', 'Aloqa uzilgan')}: {gaps}
        </span>
      )}
    </div>
  );
}
