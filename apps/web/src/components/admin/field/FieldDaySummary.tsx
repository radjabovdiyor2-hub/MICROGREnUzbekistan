'use client';

import {
  clock,
  humanDistance,
  humanDuration,
  type FieldDayHead,
  type FieldIdle,
  type FieldShift,
} from './fieldDayTypes';

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
//
// СМЕНА И ТРЕК РАЗВЕДЕНЫ. Раньше здесь стояла одна строка «Смена», и в ней
// показывалось окно записи — время первой и последней крошки. Живой экран
// владельца из-за этого утверждал «смена 00:26–11:06» там, где телефон
// прислал одну точку ночью: отличить работавшего человека от проснувшегося
// телефона было нельзя. Теперь смена — это смена, а запись — это запись.
// ══════════════════════════════════════════════════════════════════════

export function FieldDaySummary({
  day,
  shift,
  idle,
  gaps,
  lang,
}: {
  day: FieldDayHead;
  shift: FieldShift | null;
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
      {/* Смену открывает человек кнопкой — это ответ на «работал ли он». */}
      <span>
        {t('Смена', 'Smena')}:{' '}
        {shift ? (
          <>
            {clock(shift.startTime)}
            {shift.endTime ? `–${clock(shift.endTime)}` : ` — ${t('идёт', 'davom etmoqda')}`}
            {shift.closedAuto && (
              <span style={{ color: 'var(--text-muted)' }}> · {t('закрыта автоматом', 'avtomat yopgan')}</span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>{t('не открывалась', 'ochilmagan')}</span>
        )}
      </span>

      {/* Окно записи. Отличается от смены, и это видно: телефон мог прислать
          точку до начала смены или замолчать задолго до её конца. */}
      <span style={{ color: 'var(--text-secondary)' }}>
        {t('Запись', 'Yozuv')}: {clock(day.startedAt)}
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
