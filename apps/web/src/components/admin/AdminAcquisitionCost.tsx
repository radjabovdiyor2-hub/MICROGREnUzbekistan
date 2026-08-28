'use client';

import React from 'react';
import type { Acquisition } from '@/lib/customers/acquisition';

/**
 * Стоимость привлечения заведения — в заходах, а не в деньгах.
 *
 * Рекламу почти не покупают, привлечение — это ноги и топливо. Поэтому
 * вопрос звучит так: сколько дверей надо открыть ради одной согласившейся.
 * Само по себе число ничего не значит, рядом обязана стоять отдача.
 *
 * Пока ни одно заведение не прожило полгода, отдача показывается
 * прочерком: среднее по двухнедельной истории занижает тем сильнее, чем
 * быстрее растёт база, и врать в меньшую сторону не лучше, чем в большую.
 */
export function AdminAcquisitionCost({ data, lang }: { data: Acquisition; lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);

  if (data.visits === 0) return null;

  const money = (sum: number) => `${Math.round(sum).toLocaleString('ru-RU')} ${t('сум', "so'm")}`;

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        fontSize: 'var(--text-xs)',
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {t('Цена одной двери', 'Bitta eshik narxi')}
      </div>

      <div style={{ color: 'var(--text-muted)' }}>
        {t(
          `${data.visits} заходов в ${data.venues} заведений`,
          `${data.venues} muassasaga ${data.visits} tashrif`,
        )}
      </div>

      <div style={{ marginTop: 4 }}>
        {data.visitsPerWin === null
          ? t(
              'Пока не согласился никто — считать не из чего.',
              'Hozircha hech kim rozi bo‘lmadi.',
            )
          : t(
              `${data.visitsPerWin.toFixed(1)} захода на одно согласившееся заведение`,
              `Bitta rozi bo‘lgan muassasaga ${data.visitsPerWin.toFixed(1)} tashrif`,
            )}
      </div>

      <div style={{ marginTop: 4 }}>
        {data.revenuePerWon === null
          ? t(
              'Сколько заведение приносит за полгода — пока неизвестно: ни одно столько не прожило.',
              'Yarim yillik daromad hali noma’lum: hech qaysi muassasa bunchalik yashamadi.',
            )
          : t(
              `Приносит ${money(data.revenuePerWon)} за первые полгода (по ${data.matured} из ${data.won})`,
              `Birinchi yarim yilda ${money(data.revenuePerWon)} (${data.won} dan ${data.matured} tasi bo‘yicha)`,
            )}
      </div>
    </div>
  );
}
