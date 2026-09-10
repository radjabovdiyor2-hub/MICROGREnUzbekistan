'use client';

import { PauseCircle } from 'lucide-react';

import { clock, humanDuration, type FieldIdle } from './fieldDayTypes';

// ══════════════════════════════════════════════════════════════════════
// Строка простоя в ленте дня.
//
// Отдельным файлом, потому что лента упирается в 200 строк — и потому,
// что это единственное место, где о простое говорят словами.
//
// СЕРЫМ, А НЕ КРАСНЫМ. Сорок минут на месте объясняются обедом, очередью
// и поломкой. Красным в этом проекте светится только явное расхождение с
// эталоном; размывать это правило нельзя, иначе перестанут замечать и его.
// ══════════════════════════════════════════════════════════════════════

export function FieldIdleRow({ idle, lang }: { idle: FieldIdle; lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) 0',
        marginLeft: 8,
        borderLeft: '2px dashed var(--border)',
        paddingLeft: 'var(--space-4)',
      }}
    >
      <PauseCircle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 3 }} />
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        {/* СЛОВА ВАЖНЕЕ ЧИСЛА. «Стоял» — про движение, и рядом сразу
            сказано, что связь при этом была: иначе строка прочитается как
            «пропал», и спросят не о том. */}
        {t('стоял', 'turdi')} {humanDuration(idle.idleSec, lang)}
        {' · '}
        {t('не у клиента', 'mijozda emas')}
        {' · '}
        {clock(idle.startedAt)}–{clock(idle.endedAt)}
        {' · '}
        <span style={{ color: 'var(--text-muted)' }}>{t('связь была', 'aloqa bor edi')}</span>
      </div>
    </div>
  );
}
