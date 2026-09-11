'use client';

import { useState } from 'react';
import { ChevronLeft, Crosshair } from 'lucide-react';

import { agedSilentMin, cadenceIsPoor, cadenceMin } from '@/lib/tracking/cadence';
import { SILENT_MIN } from '@/lib/tracking/ping';

import { clock, humanDistance, sourceLabel } from './fieldDayTypes';
import { FieldWatchMap } from './FieldWatchMap';
import { useLivePeople } from './useLivePeople';

// ══════════════════════════════════════════════════════════════════════
// Слежение за одним человеком: где он сейчас.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЭКРАН. Отчёт дня отвечает на «как прошёл вторник» и
// собирается на сервере с пересборкой стоянок и обращением к платному
// маршрутизатору — опрашивать его раз в сорок пять секунд нельзя ни по
// времени ответа, ни по деньгам. Здесь другой вопрос и другая цена:
// та же лёгкая дверь живого слоя, только про одного.
//
// ЭКРАН НЕ ИМЕЕТ ПРАВА ВЫДАВАТЬ СТАРУЮ ТОЧКУ ЗА ТЕКУЩУЮ. Поэтому:
//   · молчание стареет, пока ответ лежит в кэше (`agedSilentMin`);
//   · рядом с ним всегда абсолютное время последней точки;
//   · молчит дольше порога — карта перестаёт ехать за ним, а подпись
//     говорит «был здесь в 14:05», а не показывает точку как живую;
//   · пропала сеть — говорим, что цифры встали, а не замираем молча.
// ══════════════════════════════════════════════════════════════════════

export function FieldWatch({
  employeeId,
  name,
  lang,
  onBack,
}: {
  employeeId: string;
  /** Имя приходит из строки, по которой нажали: дверь могла ответить пусто. */
  name: string;
  lang: 'ru' | 'uz';
  onBack: () => void;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const { people, isLoading, ageMs, frozen } = useLivePeople(employeeId);
  const [following, setFollowing] = useState(true);

  const person = people[0] ?? null;
  const silentMin = agedSilentMin(person?.silentMin ?? null, ageMs);
  const stale = (silentMin ?? 0) > SILENT_MIN;
  const last = person?.last ?? null;

  const spanMs = last && person
    ? new Date(last.at).getTime() - new Date(person.startedAt).getTime()
    : 0;
  const cadence = person ? cadenceMin(person.points, spanMs) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={onBack}
          id="field-watch-back"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            // 44 пикселя — минимальный прицел на телефоне: меньше
            // промахиваются пальцем.
            minHeight: 44, minWidth: 44, padding: '0 var(--space-2)',
            background: 'transparent', border: 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          <ChevronLeft size={18} /> {t('Все', 'Hammasi')}
        </button>
        <span style={{ fontWeight: 'var(--font-semibold)' }}>{name}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--text-sm)',
            color: silentMin === null || stale ? 'var(--text-secondary)' : 'var(--brand-primary)',
          }}
        >
          {silentMin === null
            ? t('запись дня не включена', 'kun yozuvi yoqilmagan')
            : stale
              ? t(`молчит ${silentMin} мин`, `${silentMin} daq jim`)
              : t('на связи', 'aloqada')}
        </span>
      </div>

      {frozen && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
          {t(
            'Связь пропала — цифры на этом экране больше не обновляются.',
            'Aloqa yo‘q — bu ekrandagi raqamlar yangilanmayapti.',
          )}
        </p>
      )}

      {isLoading && !person && (
        <p style={{ color: 'var(--text-muted)' }}>{t('Смотрю…', 'Qaralmoqda…')}</p>
      )}

      {!isLoading && !person && (
        <p style={{ color: 'var(--text-muted)' }}>
          {t('Сегодня этот человек запись дня не включал.', 'Bu xodim bugun kun yozuvini yoqmagan.')}
        </p>
      )}

      {/* Точки нет — карты тоже нет. Пустая карта Самарканда рядом с
          именем читается как «он где-то там», хотя мы не знаем ничего. */}
      {person && last && (
        <>
          <FieldWatchMap
            track={person.track}
            center={[last.longitude, last.latitude]}
            // Молчит — ехать не за чем: новая точка не придёт, а камера,
            // ползущая к старой, выдавала бы её за текущую.
            following={following && !stale}
            onUserMoved={() => setFollowing(false)}
          />

          {!following && (
            <button
              type="button"
              onClick={() => setFollowing(true)}
              id="field-watch-recenter"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-3)' }}
            >
              <Crosshair size={16} /> {t(`Вернуться к ${name}`, `${name}ga qaytish`)}
            </button>
          )}

          <div
            style={{
              display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap',
              fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
            }}
          >
            {/* Абсолютное время рядом с «N минут назад»: одно проверяет
                другое, и вместе они не дают принять старую точку за живую. */}
            <span>
              {t('Последняя точка', 'Oxirgi nuqta')}: {clock(last.at)}
            </span>
            <span>
              {t('Пройдено', 'Bosib o‘tilgan')}: {humanDistance(person.meters)}
            </span>
            <span>
              {t('Заездов', 'To‘xtashlar')}: {person.stops}
            </span>
            {person.lastSource !== null && <span>{sourceLabel(person.lastSource, lang)}</span>}
            {cadence !== null && (
              <span style={{ color: cadenceIsPoor(cadence) ? 'var(--text-primary)' : undefined }}>
                {t(`раз в ${cadence} мин`, `${cadence} daqiqada bir`)}
              </span>
            )}
            {/* Точность важна, когда она плохая: точка «±500 м» — это
                вышка, а не позиция, и на карте она выглядит уликой. */}
            {last.accuracyM !== null && last.accuracyM > 100 && <span>±{last.accuracyM} м</span>}
            {person.trimmed && (
              <span>{t('показан последний отрезок пути', 'yo‘lning oxirgi qismi')}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
