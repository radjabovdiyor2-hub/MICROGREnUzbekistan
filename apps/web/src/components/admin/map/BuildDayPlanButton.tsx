'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';

import { useFeedback } from '../AdminFeedback';
import { buildDayPlan, planMix, PLAN_SIZE, type PlanCandidate } from '@/lib/customers/dayPlan';
import { mergeStops } from '@/lib/customers/planCarry';
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
//
// И ОТДЕЛЬНО — ПРО НАЗНАЧЕННЫЙ ОБЪЕЗД.
//
// Спрашивали только про то, что набрано на карте прямо сейчас. А план
// сохраняется ключом «дата + исполнитель» и ЗАМЕНЯЕТ прежний: владелец
// назначил Азизу восемь точек, прислал ему их в Telegram — Азиз нажал
// «собрать», и назначение исчезло молча. Владелец при этом видит план,
// которого не составлял, помеченный «собрал себе сам».
//
// Со стороны владельца такая проверка была (`AssignRouteFromMap`
// спрашивает перед заменой), со стороны продавца — нет. Перезаписывал же
// именно он.
// ══════════════════════════════════════════════════════════════════════

/** Остановка, перенесённая со вчера: столько, сколько нужно для объезда. */
interface CarryStop {
  customerId: number;
  carriedTimes: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface DayContext {
  /** Объезд, назначенный сверху на сегодня. */
  assigned: { stops: number; author: string } | null;
  /** До кого вчера не доехали. */
  carry: CarryStop[];
  /** Сколько вчерашних перестали таскать: исчерпан предел переносов. */
  exhausted: number;
}

const EMPTY_DAY: DayContext = { assigned: null, carry: [], exhausted: 0 };

/**
 * Что уже известно про сегодняшний день: назначение сверху и вчерашний хвост.
 *
 * ОДНИМ ЗАПРОСОМ, потому что дверь одна и отвечает обо всём дне сразу.
 * Двумя было бы двое ворот в одно состояние, и однажды они ответили бы
 * по-разному.
 *
 * Ошибку глотаем намеренно: не смогли спросить — не мешаем собрать план.
 * И предупреждение, и перенос — удобство, а не рубеж. Тот же приём, что у
 * `existingStops` в `AssignRouteFromMap`.
 */
async function readDayContext(): Promise<DayContext> {
  try {
    const res = await fetch('/api/admin/visit-plans', { credentials: 'same-origin' });
    if (!res.ok) return EMPTY_DAY;
    const body = await res.json();
    const plans: { stops?: unknown[]; source?: string; author?: string }[] = Array.isArray(
      body?.plans,
    )
      ? body.plans
      : [];
    // Интересует только назначенное СВЕРХУ: свой вчерашний черновик
    // переспрашивать незачем, про него уже спросили выше.
    const found = plans.find((p) => p.source === 'owner' && (p.stops?.length ?? 0) > 0);

    const carry: CarryStop[] = (Array.isArray(body?.carry) ? body.carry : []).filter(
      (s: CarryStop) => typeof s?.customerId === 'number',
    );

    return {
      assigned: found ? { stops: found.stops?.length ?? 0, author: found.author ?? '' } : null,
      carry,
      exhausted: Array.isArray(body?.carryExhausted) ? body.carryExhausted.length : 0,
    };
  } catch {
    return EMPTY_DAY;
  }
}

/**
 * Кого сегодня ждут по расписанию.
 *
 * Отдаёт номера клиентов, у которых сегодняшний день недели отмечен как
 * день заезда. Пусто — обычный день, и план собирается как раньше.
 *
 * АДРЕСНОСТЬ. Строка расписания бывает именной («сюда едет Азиз») и общей
 * («любому, кто поедет»). Продавцу годятся обе, чужая именная — нет:
 * иначе он повезёт порученное другому. Владелец собирает черновик, чтобы
 * кому-то его НАЗНАЧИТЬ, и ему годятся все.
 *
 * ИЗВЕСТНЫЙ КРАЙ. Дверь отдаёт по одной строке на клиента и предпочитает
 * именную общей. Значит у клиента с двумя строками — «Бекзод по средам» и
 * «любому» — Азиз сегодняшней надбавки не увидит. Это потеря подсказки, а
 * не потеря клиента: он остаётся обычным кандидатом и проходит по общему
 * весу. Чинить это надо в двери и не ценой чужого расписания.
 */
async function scheduledToday(sellerName: string, isOwner: boolean): Promise<Set<number>> {
  try {
    const res = await fetch('/api/admin/visit-schedules', { credentials: 'same-origin' });
    if (!res.ok) return new Set();
    const body = await res.json();
    const items: { customerId?: unknown; assignee?: unknown }[] = Array.isArray(body?.items)
      ? body.items
      : [];

    const mine = new Set<number>();
    for (const row of items) {
      if (typeof row.customerId !== 'number') continue;
      const to = typeof row.assignee === 'string' ? row.assignee : '';
      if (!isOwner && to !== '' && to !== sellerName) continue;
      mine.add(row.customerId);
    }
    return mine;
  } catch {
    return new Set();
  }
}

export function BuildDayPlanButton({
  lang,
  points,
  hasStops,
  isOwner = false,
  sellerName = '',
  onPlan,
}: {
  lang: 'ru' | 'uz';
  /** Точки, видимые на карте сейчас: план считается по ним же. */
  points: PointView[];
  hasStops: boolean;
  /**
   * Владелец собирает СЕБЕ ЧЕРНОВИК, а не план.
   *
   * У него автоплан сохранялся сразу — и без исполнителя, потому что
   * назвать его тут некому. На экране дня это появлялось строкой «Ничей
   * план»: запись, которую никто не заказывал и которая ничего не значит.
   * Владелец собирает точки, чтобы НАЗНАЧИТЬ их человеку, и сохранение
   * происходит именно назначением — ниже в той же панели.
   *
   * У продавца всё как было: он собирает план себе, и сохранить его надо
   * сразу, иначе владелец не увидит ни плана, ни его исполнения.
   */
  isOwner?: boolean;
  /**
   * Кто собирает. Нужен расписанию: строка «сюда едет Азиз» адресная, и
   * чужую подставлять нельзя — человек повезёт порученное другому.
   */
  sellerName?: string;
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

    // День спрашиваем один раз: и про назначение сверху, и про вчерашний
    // хвост. Владельцу хвост не приходит — дверь не знает, чей он.
    const day = await readDayContext();

    // Назначенное сверху молча не переписываем. Спрашиваем только у того,
    // кто сохраняет на сервер, — у владельца план остаётся черновиком и
    // ничего не затирает.
    if (!isOwner) {
      const assigned = day.assigned;
      if (assigned) {
        const who = assigned.author ? ` (${assigned.author})` : '';
        const agreed = await notify.confirm({
          title:
            lang === 'ru'
              ? `На сегодня вам назначен объезд${who} — ${assigned.stops} точек. Заменить своим планом?`
              : `Bugunga yoʻnalish tayinlangan${who} — ${assigned.stops} nuqta. Almashtirilsinmi?`,
          detail:
            lang === 'ru'
              ? 'Назначенный список исчезнет, и владелец увидит план, который собрали вы. Отметки о выполненных визитах останутся.'
              : 'Tayinlangan roʻyxat oʻchadi. Tashriflar belgilari qoladi.',
          confirmText: lang === 'ru' ? 'Заменить' : 'Almashtirish',
          danger: true,
        });
        if (!agreed) return;
      }
    }

    setBusy(true);
    try {
      const at = await readPosition();
      const scheduled = await scheduledToday(sellerName, isOwner);

      const candidates: PlanCandidate[] = points.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        state: p.state,
        overdueRatio: p.overdueRatio,
        lastVisitDays: p.lastVisitDays,
        scheduledToday: scheduled.has(p.id),
      }));

      // ── ВЧЕРАШНИЙ ХВОСТ ИДЁТ ПЕРВЫМ ───────────────────────────────
      //
      // Точка, до которой не доехали вчера, не должна проигрывать очередь
      // свежей: иначе она не выиграет её никогда — завтра рядом с ней
      // окажется ещё более свежая. Порядок задаёт `mergeStops`, там же
      // снимаются дубли: точка, оставшаяся со вчера и заодно выпавшая по
      // расписанию, — это одна поездка, а не две.
      //
      // ХВОСТ НЕ ЗАНИМАЕТ ВЕСЬ ДЕНЬ. Автоплан считается на полный размер,
      // а перенос добавляется сверху; длиннее `PLAN_SIZE` день быть может,
      // и это честно: невыполненное вчера — это работа, а не пожелание.
      // Лишнее человек выкинет из объезда сам, как и любую другую точку.
      const carryable = day.carry.filter(
        (s) => typeof s.latitude === 'number' && typeof s.longitude === 'number',
      );
      const fresh = buildDayPlan(candidates, at, PLAN_SIZE);
      const merged = mergeStops(carryable, fresh.map((p) => p.id));

      // Обратно в точки объезда. Координаты берём у того, кто их знает:
      // у карты — для свежих, у переноса — для вчерашних, которых на
      // карте может и не быть, если их спрятал текущий фильтр.
      const byId = new Map<number, RoutePoint>([
        ...carryable.map(
          (s) =>
            [
              s.customerId,
              {
                id: s.customerId,
                name: s.name,
                latitude: s.latitude as number,
                longitude: s.longitude as number,
              },
            ] as const,
        ),
        ...fresh.map((p) => [p.id, p] as const),
      ]);
      const plan = merged
        .map((s) => byId.get(s.customerId))
        .filter((p): p is RoutePoint => p !== undefined);

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

      // ── План уходит на сервер ─────────────────────────────────────
      //
      // Ради этого он вообще перестал быть локальным списком: пока план
      // жил только в телефоне, владелец не видел ни его, ни того, что
      // из него выполнено. Составлял и отчитывался один человек.
      //
      // ОТКАЗ СОХРАНЕНИЯ НЕ ОТМЕНЯЕТ ПЛАН. Человек уже собрался ехать,
      // список у него перед глазами, и отбирать его из-за упавшей сети
      // значило бы наказать за отсутствие связи. Говорим вслух и
      // работаем дальше — не молчим: неотправленный план владелец не
      // увидит, и знать об этом должны оба.
      // Владельцу сохранять нечего: у его черновика нет исполнителя, и
      // на сервере он становился безымянной записью. Сохранит назначение.
      if (!isOwner) {
        try {
          const res = await fetch('/api/admin/visit-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ customerIds: plan.map((p) => p.id) }),
          });
          if (!res.ok) throw new Error(String(res.status));
        } catch {
          notify.toast(
            lang === 'ru'
              ? 'План собран, но не ушёл владельцу — нет связи'
              : 'Reja tuzildi, lekin yuborilmadi',
            'warning',
          );
        }
      }

      // Состав дня, а не только его длина.
      //
      // Новые двери и обслуживание своих — разная работа, и в общем счёте
      // её не видно. Обслуживать привычнее: там ждут и не отказывают, —
      // но новых заведений от этого не прибавляется, а растёт дело
      // именно за их счёт. День, целиком ушедший на своих, должен быть
      // виден сразу, а не через месяц по отсутствию роста.
      const mix = planMix(plan, candidates);
      const mixRu = `${mix.fresh} новых, ${mix.existing} своих`;

      // Откуда что взялось — частью той же строки. Перенос и расписание
      // меняют состав дня молча, а человек должен понимать, почему ему
      // предложили именно это: иначе список выглядит произволом, и
      // доверие к кнопке кончается на первом же неожиданном адресе.
      const carried = plan.filter((p) => carryable.some((c) => c.customerId === p.id)).length;
      const byPlan = plan.filter((p) => scheduled.has(p.id)).length;
      const extraRu = [
        carried > 0 ? `${carried} со вчера` : '',
        byPlan > 0 ? `${byPlan} по расписанию` : '',
      ].filter(Boolean);
      const tailRu = extraRu.length > 0 ? `, из них ${extraRu.join(' и ')}` : '';

      notify.success(
        lang === 'ru'
          ? at
            ? `План на сегодня: ${plan.length} — ${mixRu}${tailRu}, от вашего места`
            : `План на сегодня: ${plan.length} — ${mixRu}${tailRu}. Место не определилось, порядок поправьте сами`
          : `Bugungi reja: ${plan.length} — ${mix.fresh} yangi, ${mix.existing} doimiy`,
      );

      // ── Исчерпавшие предел переносов — отдельным словом ──────────────
      //
      // Точку, не объеханную пять раз подряд, перестаём таскать в плане.
      // Промолчать здесь значило бы потерять клиента тем же способом, от
      // которого перенос и придуман, — только теперь окончательно.
      if (day.exhausted > 0) {
        notify.toast(
          lang === 'ru'
            ? `${day.exhausted} точек переносили пять дней подряд — они выпали из плана. Решите по ним отдельно`
            : `${day.exhausted} nuqta besh kun koʻchirildi — rejadan chiqdi`,
          'warning',
        );
      }
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
