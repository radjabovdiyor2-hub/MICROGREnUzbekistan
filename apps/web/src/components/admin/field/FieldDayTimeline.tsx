'use client';

import { Camera, MapPin, Navigation } from 'lucide-react';

import { reconcileLeg, verdictLabel, verdictToken } from '@/lib/tracking/reconcile';

import {
  clock,
  humanDistance,
  humanDuration,
  stayTitle,
  type FieldLeg,
  type FieldStay,
} from './fieldDayTypes';

// ══════════════════════════════════════════════════════════════════════
// Лента дня: стоянка — дорога — стоянка.
//
// Читается сверху вниз как рассказ о дне, а не как таблица: владелец
// спрашивает «где он был во вторник», а не «покажи среднее время плеча».
//
// ЦВЕТ — ТОЛЬКО У ЯВНОГО РАСХОЖДЕНИЯ. Дисциплину задал `VisitProofLine`, и
// нарушать её здесь нельзя: если красным светится каждое второе плечо,
// красный перестают замечать вместе с настоящими случаями.
// ══════════════════════════════════════════════════════════════════════

function StayRow({ stay, lang }: { stay: FieldStay; lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  // Подтверждённое человеком и выведенное машиной различаются на вид:
  // выдавать догадку по крошкам за нажатую кнопку нельзя.
  const manual = stay.confirmedBy === 'manual';

  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) 0' }}>
      <MapPin size={18} style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 'var(--font-semibold)' }}>{stayTitle(stay)}</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {clock(stay.arrivedAt)}
          {stay.leftAt ? `–${clock(stay.leftAt)}` : ''}
          {' · '}
          {stay.dwellSec === null
            ? t('ещё на точке', 'hali nuqtada')
            : humanDuration(stay.dwellSec, lang)}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {manual ? t('отмечено вручную', "qo'lda belgilangan") : t('по треку', 'trek bo‘yicha')}
          {stay.interaction?.distanceM !== null && stay.interaction !== null && (
            <> · {humanDistance(stay.interaction.distanceM ?? 0)} {t('до пина', 'pingacha')}</>
          )}
        </div>
        {stay.photos.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
            {stay.photos.map((photo) => (
              // Обычный <img>, а не next/image: кадр лежит в /uploads на
              // том же origin и уже приведён к нужному размеру при
              // загрузке — оптимизатору здесь нечего делать.
              <img
                key={photo.id}
                src={photo.imageUrl}
                alt=""
                width={96}
                height={72}
                style={{ objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              />
            ))}
          </div>
        )}
        {stay.photos.length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Camera size={12} /> {t('без фото', 'suratsiz')}
          </div>
        )}
      </div>
    </div>
  );
}

function LegRow({ leg, lang }: { leg: FieldLeg; lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const check = reconcileLeg({ actualSec: leg.actualSec, expectedSec: leg.expectedSec });

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
      <Navigation size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 3 }} />
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        {t('в пути', 'yo‘lda')} {humanDuration(leg.actualSec, lang)}
        {leg.actualMeters > 0 && <> · {humanDistance(leg.actualMeters)}</>}
        {' · '}
        <span style={{ color: verdictToken(check.verdict) }}>
          {verdictLabel(check.verdict, lang)}
          {leg.expectedSec !== null && (
            <> ({t('норма', 'me‘yor')} {humanDuration(leg.expectedSec, lang)}
            {leg.trafficUsed ? t(', с пробками', ', tirbandlik bilan') : ''})</>
          )}
        </span>
      </div>
    </div>
  );
}

export function FieldDayTimeline({
  stays,
  legs,
  lang,
}: {
  stays: FieldStay[];
  legs: FieldLeg[];
  lang: 'ru' | 'uz';
}) {
  // Плечо ищем по стоянке, из которой выехали: порядок в ленте задают
  // стоянки, а плечо — то, что между ними.
  const legAfter = new Map(legs.map((leg) => [leg.fromStayId, leg]));

  return (
    <div>
      {stays.map((stay, i) => {
        const leg = legAfter.get(stay.id);
        return (
          <div key={stay.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <StayRow stay={stay} lang={lang} />
            {leg && <LegRow leg={leg} lang={lang} />}
          </div>
        );
      })}
    </div>
  );
}
