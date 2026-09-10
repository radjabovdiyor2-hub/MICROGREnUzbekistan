import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { localDayRange } from '@/lib/localDate';
import { planLines, planProgress } from '@/lib/customers/planMessage';
import { readDayPlans } from '@/lib/customers/visitPlanStore';
import { buildMultiStopUrl } from '@/lib/customers/navigation';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// «Мой день» для бота: точки по порядку и что осталось.
//
// ГОТОВЫЙ ТЕКСТ, А НЕ СЫРЫЕ СТРОКИ. Тот же список печатает уведомление о
// назначении, и собирается он одним помощником (`planMessage.ts`). Отдай
// мы боту сырьё — он собрал бы список вторыми руками, и через месяц
// человек видел бы в сообщении один порядок точек, а в «Моём дне» другой.
//
// ВЫПОЛНЕНО СЧИТАЕТСЯ ПО ОТМЕТКАМ ВИЗИТОВ, а не по нажатию: закрыть
// остановку может только настоящая поездка с координатой. Это правило
// живёт в `visitPlanStore`, и второго определения слова «выполнено» здесь
// не заводим.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = request.nextUrl.searchParams.get('telegramId') ?? '';
    if (!/^\d{1,19}$/.test(raw)) {
      return NextResponse.json({ error: 'Не указан telegramId' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { telegramId: BigInt(raw) },
      select: { name: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 403 });
    }

    const { start } = localDayRange();
    const plans = await readDayPlans({ planDate: start, assignee: employee.name });
    const plan = plans[0];

    if (!plan || plan.stops.length === 0) {
      return NextResponse.json({
        status: 'ok',
        has: false,
        text: 'На сегодня объезд не назначен.',
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
      status: 'ok',
      has: true,
      accepted: plan.acceptedAt !== null,
      planId: plan.id,
      text: `🗺 <b>Мой день</b> — ${planProgress(stops)}\n\n${planLines(stops)}`,
      navUrl,
    });
  } catch (error: unknown) {
    console.error('API Admin Staff Day GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
