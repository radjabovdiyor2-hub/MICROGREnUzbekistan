import { NextRequest, NextResponse } from 'next/server';

import { localDayRange } from '@/lib/localDate';
import { nextLines, planLines, planProgress } from '@/lib/customers/planMessage';
import { nextStopsFor } from '@/lib/customers/staffDay';
import { readDayPlans } from '@/lib/customers/visitPlanStore';
import { buildMultiStopUrl } from '@/lib/customers/navigation';
import { safeError } from '@/lib/safeError';
import { staffActor } from '@/lib/staffActor';

// ══════════════════════════════════════════════════════════════════════
// «Мой день»: точки по порядку, что осталось и куда дальше.
//
// ГОТОВЫЙ ТЕКСТ, А НЕ СЫРЫЕ СТРОКИ. Тот же список печатает уведомление о
// назначении, и собирается он одним помощником (`planMessage.ts`). Отдай мы
// боту сырьё — он собрал бы список вторыми руками, и через месяц человек
// видел бы в сообщении один порядок точек, а в «Моём дне» другой.
//
// ВЫПОЛНЕНО СЧИТАЕТСЯ ПО ОТМЕТКАМ ВИЗИТОВ, а не по нажатию: закрыть
// остановку может только настоящая поездка с координатой. Правило живёт в
// `visitPlanStore`, второго определения слова «выполнено» здесь нет.
//
// «КУДА ДАЛЬШЕ» ЖИВЁТ ЗДЕСЬ ЖЕ, А НЕ ЗА СВОЕЙ ДВЕРЬЮ. Вопрос тот же — «что
// у меня сегодня», — только заданный посреди дня. Своя дверь потребовала бы
// пятой копии правил: кто это, открыта ли смена, свежа ли позиция, чей план,
// что считается выполненным. Две двери расходятся, одна не может.
//
// ДВЕ ДОРОГИ ВНУТРЬ. Раньше была одна — ботовый секрет, и приложение сюда
// постучаться не могло. Теперь общий разбор `staffActor`: сессия сотрудника
// или секрет бота с `telegramId`. Ключ устройства сюда не пускает
// middleware, и это правильно: экран открыт человеком, а не фоновой службой.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const who = await staffActor(request, null);
    if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });

    const { start } = localDayRange();
    const [plans, suggestion] = await Promise.all([
      readDayPlans({ planDate: start, assignee: who.name }),
      nextStopsFor(who.id, who.name),
    ]);
    const plan = plans[0];

    // Подсказка отдаётся ВСЕГДА, даже когда объезд не назначен: именно тогда
    // она и нужнее всего — человек в поле, а плана у него нет.
    const tail = nextLines(suggestion.next);
    const common = {
      status: 'ok' as const,
      gate: suggestion.gate,
      gateText: suggestion.gateText,
      freshAfterMin: suggestion.freshAfterMin,
      next: suggestion.next,
    };

    if (!plan || plan.stops.length === 0) {
      return NextResponse.json({
        ...common,
        has: false,
        text: `На сегодня объезд не назначен.${tail}`,
      });
    }

    const stops = plan.stops.map((s) => ({ name: s.name, done: s.done }));

    // Ссылка ведёт только по НЕПРОЙДЕННЫМ: вести человека туда, где он уже
    // был, — это лишний крюк и потерянное доверие к кнопке.
    const left = plan.stops.filter((s) => !s.done && s.latitude !== null && s.longitude !== null);
    const navUrl =
      left.length > 0
        ? buildMultiStopUrl(
            // Яндекс.Карты, а не Навигатор: приложение есть не у всех, а
            // веб-карты откроются в браузере у любого.
            'yandexmaps',
            left.map((s) => ({
              latitude: s.latitude as number,
              longitude: s.longitude as number,
            })),
          )
        : null;

    return NextResponse.json({
      ...common,
      has: true,
      accepted: plan.acceptedAt !== null,
      planId: plan.id,
      text: `🗺 <b>Мой день</b> — ${planProgress(stops)}\n\n${planLines(stops)}${tail}`,
      navUrl,
    });
  } catch (error: unknown) {
    console.error('API Admin Staff Day GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
