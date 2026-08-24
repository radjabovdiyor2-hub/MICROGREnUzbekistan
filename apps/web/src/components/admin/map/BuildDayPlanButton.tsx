'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';

import { useFeedback } from '../AdminFeedback';
import { buildDayPlan, PLAN_SIZE, type PlanCandidate } from '@/lib/customers/dayPlan';
import { readPosition } from '@/lib/geo/position';
import type { RoutePoint } from '@/lib/customers/dayRoute';
import type { PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// «Собрать план на сегодня».
//
// ЗАЧЕМ. Объезд набирался вручную — продавец тыкал по карте тех, кого
// помнит. А помнит он тех, кто и так покупает; просроченные при этом тихо
// уходили. На пятистах клиентах память перестаёт быть отбором.
//
// ОТКУДА СТАРТ. Спрашиваем позицию телефона: план от места, где человек
// стоит, а не от центра города. Не ответила — собираем без старта и
// говорим об этом: план без порядка объезда всё равно лучше, чем его
// отсутствие.
//
// ПЛАН ЗАМЕНЯЕТ ОБЪЕЗД ЦЕЛИКОМ, и об этом спрашиваем, если там уже
// что-то есть: дописать план к вчерашним остаткам значит выдать смесь за
// план, а человек будет думать, что ему это посоветовали.
// ══════════════════════════════════════════════════════════════════════

export function BuildDayPlanButton({
  lang,
  points,
  hasStops,
  onPlan,
}: {
  lang: 'ru' | 'uz';
  /** Точки, видимые на карте сейчас: план считается по ним же. */
  points: PointView[];
  hasStops: boolean;
  onPlan: (stops: RoutePoint[]) => void;
}) {
  const notify = useFeedback();
  const [busy, setBusy] = useState(false);

  const build = async () => {
    if (busy) return;

    if (hasStops) {
      const agreed = await notify.confirm({
        title: lang === 'ru' ? 'Заменить объезд планом на сегодня?' : 'Yoʻnalish almashtirilsinmi?',
        detail:
          lang === 'ru'
            ? 'То, что набрано сейчас, будет убрано. План можно поправить после — выкинуть остановку или добавить свою.'
            : 'Hozirgi roʻyxat oʻchadi.',
        confirmText: lang === 'ru' ? 'Собрать' : 'Yigʻish',
      });
      if (!agreed) return;
    }

    setBusy(true);
    try {
      const at = await readPosition();
      const candidates: PlanCandidate[] = points.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        state: p.state,
        overdueRatio: p.overdueRatio,
        lastVisitDays: p.lastVisitDays,
      }));

      const plan = buildDayPlan(candidates, at, PLAN_SIZE);

      if (plan.length === 0) {
        // Пустой план — это ответ, а не сбой: значит к тем, кто рядом, на
        // днях уже заезжали. Говорим именно так, иначе человек решит, что
        // кнопка сломана, и будет жать её снова.
        notify.toast(
          lang === 'ru'
            ? 'Ехать не к кому: рядом все объезжены на днях'
            : 'Bugun boradigan joy yoʻq',
          'info',
        );
        return;
      }

      onPlan(plan);
      notify.success(
        lang === 'ru'
          ? at
            ? `План на сегодня: ${plan.length} — от вашего места`
            : `План на сегодня: ${plan.length}. Место не определилось — порядок поправьте сами`
          : `Bugungi reja: ${plan.length}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={busy}
      onClick={() => void build()}
      style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <Wand2 size={15} />
      {busy ? '…' : lang === 'ru' ? 'Собрать на сегодня' : 'Bugunga yigʻish'}
    </button>
  );
}
