'use client';

import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';

import { FieldDayMap } from './FieldDayMap';
import { clock, humanDistance } from './fieldDayTypes';

// ══════════════════════════════════════════════════════════════════════
// «Кто сейчас в поле» — живая карта для владельца.
//
// ОТДЕЛЬНО ОТ ОТЧЁТА ДНЯ намеренно. Отчёт отвечает на «как прошёл
// вторник»: один человек, вечером, спокойно. Здесь другой вопрос и другое
// время — «где сейчас все», посреди дня, между делами. Смешать их в один
// экран значит заставить выбирать сотрудника и дату там, где нужен один
// взгляд.
//
// СТАРАЯ ТОЧКА НЕ ВЫДАЁТСЯ ЗА ТЕКУЩУЮ. Рядом с каждым — сколько минут он
// молчит. Показать позицию часовой давности без этой подписи значит
// соврать картой: владелец решит, что человек стоит там сейчас.
// ══════════════════════════════════════════════════════════════════════

interface LivePerson {
  id: string;
  name: string;
  startedAt: string;
  meters: number;
  stops: number;
  track: { at: string; latitude: number; longitude: number; accuracyM: number | null }[];
  last: { at: string; latitude: number; longitude: number } | null;
  silentMin: number | null;
}

/** Обновляем раз в минуту — с той же частотой, с какой шлёт Telegram. */
const REFRESH_MS = 60_000;

/** Дольше этого молчания точка перестаёт быть «сейчас». */
const STALE_MIN = 15;

export function FieldLive({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const { data, isLoading } = useQuery<{ people: LivePerson[] }>({
    queryKey: ['field-live'],
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch('/api/admin/tracking/live');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить');
      return body;
    },
  });

  const people = data?.people ?? [];

  // Все треки в одну карту: владелец смотрит на город целиком, а не
  // переключается между людьми.
  const track = people.flatMap((person) => person.track);
  // Текущие позиции — точками поверх. Кладём их в тот же слой стоянок:
  // отдельный слой ради двух кружков не окупается, а вид у них тот же.
  const marks = people
    .filter((person) => person.last !== null)
    .map((person, index) => ({
      id: -(index + 1),
      latitude: person.last?.latitude ?? null,
      longitude: person.last?.longitude ?? null,
      dwellSec: null,
      confirmedBy: (person.silentMin ?? 0) <= STALE_MIN ? 'manual' : 'derived',
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

      {isLoading && (
        <p style={{ color: 'var(--text-muted)' }}>{t('Смотрю…', 'Qaralmoqda…')}</p>
      )}

      {!isLoading && people.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          {t(
            'Сегодня никто не включал трансляцию геопозиции.',
            'Bugun hech kim geopozitsiya translyatsiyasini yoqmagan.',
          )}
        </p>
      )}

      {people.length > 0 && (
        <>
          <FieldDayMap track={track} stays={marks} />

          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {people.map((person) => {
              const stale = (person.silentMin ?? 0) > STALE_MIN;
              return (
                <div
                  key={person.id}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span style={{ fontWeight: 'var(--font-semibold)' }}>{person.name}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {t('с', 'dan')} {clock(person.startedAt)}
                    {' · '}
                    {humanDistance(person.meters)}
                    {' · '}
                    {person.stops} {t('заездов', 'toʻxtash')}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      marginLeft: 'auto',
                      // Серым, а не красным: молчание — это про связь, а не
                      // про человека. Красным здесь светил бы каждый подвал.
                      color:
                        person.silentMin === null || stale
                          ? 'var(--text-secondary)'
                          : 'var(--brand-primary)',
                    }}
                  >
                    {/* «Точек нет» — это не поломка и не молчание связи:
                        человек отметился в админке, но трансляцию в
                        Telegram не включил. Говорим прямо, что делать, —
                        иначе владелец решит, что сломался трек. */}
                    {person.silentMin === null
                      ? t('трансляция не включена', 'translyatsiya yoqilmagan')
                      : stale
                        ? t(`молчит ${person.silentMin} мин`, `${person.silentMin} daq jim`)
                        : t('на связи', 'aloqada')}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
