'use client';

import { useState } from 'react';
import { Radio } from 'lucide-react';

import { agedSilentMin } from '@/lib/tracking/cadence';
import { SILENT_MIN } from '@/lib/tracking/ping';

import { FieldDayMap } from './FieldDayMap';
import { FieldPersonRow } from './FieldPersonRow';
import { FieldWatch } from './FieldWatch';
import { useLivePeople } from './useLivePeople';

// ══════════════════════════════════════════════════════════════════════
// «Кто сейчас в поле» — живая карта для владельца.
//
// ОТДЕЛЬНО ОТ ОТЧЁТА ДНЯ намеренно. Отчёт отвечает на «как прошёл
// вторник»: один человек, вечером, спокойно. Здесь другой вопрос и другое
// время — «где сейчас все», посреди дня, между делами.
//
// КАЖДЫЙ ПУТЬ ОТДЕЛЬНО. Раньше точки всех людей складывались в один
// массив, а рисовальщик соединяет соседние точки отрезком — между
// последней точкой одного человека и первой точкой другого выходила
// сплошная фирменная линия через полгорода. Владелец увидел её и спросил,
// почему трек прямой.
//
// СТРОКА — ВХОД В СЛЕЖЕНИЕ. Владелец смотрит на два имени, и следующее
// его движение — ткнуть в то, за кем хочет посмотреть.
//
// СТАРАЯ ТОЧКА НЕ ВЫДАЁТСЯ ЗА ТЕКУЩУЮ: рядом с каждым — сколько минут он
// молчит, и это число стареет на клиенте, пока ответ лежит в кэше.
// ══════════════════════════════════════════════════════════════════════

export function FieldLive({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [watching, setWatching] = useState<{ id: string; name: string } | null>(null);
  const { people, isLoading, ageMs, frozen } = useLivePeople();

  if (watching) {
    return (
      <FieldWatch
        employeeId={watching.id}
        name={watching.name}
        lang={lang}
        onBack={() => setWatching(null)}
      />
    );
  }

  const tracks = people.map((person) => person.track);
  // Текущие позиции — точками поверх. Кладём их в тот же слой стоянок:
  // отдельный слой ради двух кружков не окупается, а вид у них тот же.
  const marks = people
    .filter((person) => person.last !== null)
    .map((person, index) => ({
      id: -(index + 1),
      latitude: person.last?.latitude ?? null,
      longitude: person.last?.longitude ?? null,
      dwellSec: null,
      confirmedBy:
        (agedSilentMin(person.silentMin, ageMs) ?? 0) <= SILENT_MIN ? 'manual' : 'derived',
    }));

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 'var(--space-3)',
          fontWeight: 'var(--font-semibold)',
        }}
      >
        <Radio size={18} style={{ color: 'var(--brand-primary)' }} />
        {t('Сейчас в поле', 'Hozir dalada')}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{people.length}</span>
      </div>

      {frozen && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
          {t(
            'Связь пропала — цифры на этом экране больше не обновляются.',
            'Aloqa yo‘q — bu ekrandagi raqamlar yangilanmayapti.',
          )}
        </p>
      )}

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>{t('Смотрю…', 'Qaralmoqda…')}</p>}

      {!isLoading && people.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          {t(
            'Сегодня никто не включал запись дня — ни в Telegram, ни в браузере, ни в приложении.',
            'Bugun hech kim kun yozuvini yoqmagan.',
          )}
        </p>
      )}

      {people.length > 0 && (
        <>
          <FieldDayMap tracks={tracks} stays={marks} />

          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {people.map((person) => (
              <FieldPersonRow
                key={person.id}
                person={person}
                silentMin={agedSilentMin(person.silentMin, ageMs)}
                lang={lang}
                onWatch={() => setWatching({ id: person.id, name: person.name })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
