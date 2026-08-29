import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';

import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { parseBody } from '@/lib/api/parseBody';
import { safeError } from '@/lib/safeError';
import { startOfLocalDay } from '@/lib/localDate';
import { PRACTICES, PRACTICE_BY_KEY } from '@/lib/owner/catalog';
import { isRhythm, type Rhythm } from '@/lib/owner/practices';
import { progressOf, type Progress } from '@/lib/owner/progress';

// ══════════════════════════════════════════════════════════════════════
// Экран владельца: практики жизни и дела.
//
// БЕЗ АУДИТА, И ЭТО НАМЕРЕННО. Аудит отвечает на вопрос «кто из
// сотрудников что сделал с данными дела». Здесь владелец отмечает
// собственный сон, отдых и разбор своих решений — писать это в общий
// журнал действий значит завести за человеком слежку в его же системе.
// Экран под ADMIN, то есть под ним самим.
// ══════════════════════════════════════════════════════════════════════

/** Насколько глубоко смотрим отметки. Год закрывает даже квартальную серию. */
const HISTORY_DAYS = 400;

const tickSchema = z.object({
  key: z.string().min(1).max(80),
  /** Пусто — сегодня. Отметить вчерашний день — обычное дело. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** false — снять отметку: нажали не на ту строку. */
  done: z.boolean().optional(),
});

const stateSchema = z.object({
  key: z.string().min(1).max(80),
  status: z.enum(['active', 'paused', 'done']).optional(),
  rhythm: z.string().max(10).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export interface PracticeView {
  key: string;
  title: string;
  why: string;
  /** Ритм с учётом выбора владельца: его решение главнее каталога. */
  rhythm: Rhythm;
  /** Ритм отличается от предложенного каталогом. */
  custom: boolean;
  area: string;
  videos: string[];
  status: string;
  note: string | null;
  progress: Progress;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const [ticks, states] = await Promise.all([
      prisma.ownerPracticeTick.findMany({
        where: { date: { gte: startOfLocalDay(since) } },
        select: { key: true, date: true },
      }),
      prisma.ownerPracticeState.findMany(),
    ]);

    const byKey = new Map<string, Date[]>();
    for (const t of ticks) {
      const list = byKey.get(t.key);
      if (list) list.push(t.date);
      else byKey.set(t.key, [t.date]);
    }

    const stateOf = new Map(states.map((s) => [s.key, s]));
    const today = new Date();

    const practices: PracticeView[] = PRACTICES.map((p) => {
      const state = stateOf.get(p.key);
      const chosen = state?.rhythm && isRhythm(state.rhythm) ? state.rhythm : p.rhythm;

      return {
        key: p.key,
        title: p.title,
        why: p.why,
        rhythm: chosen,
        custom: chosen !== p.rhythm,
        area: p.key.split('-')[0],
        videos: p.videos,
        status: state?.status ?? 'active',
        note: state?.note ?? null,
        progress: progressOf(byKey.get(p.key) ?? [], chosen, today),
      };
    });

    return NextResponse.json({ status: 'ok', practices });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, tickSchema);
  if (!parsed.ok) return parsed.response;

  const { key, date, done } = parsed.data;
  if (!PRACTICE_BY_KEY.has(key)) {
    return NextResponse.json({ error: 'Нет такой практики' }, { status: 404 });
  }

  // Дата приходит как ГГГГ-ММ-ДД и означает КАЛЕНДАРНЫЙ день, а не момент.
  // `new Date('2026-08-28')` — это полночь UTC, то есть у нас уже 5 утра;
  // колонка типа Date отбросит время, но день при отрицательном смещении
  // съехал бы на предыдущий. Разбираем по частям, без часовых поясов.
  const at = date
    ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
    : startOfLocalDay(new Date());

  if (at.getTime() > startOfLocalDay(new Date()).getTime()) {
    return NextResponse.json({ error: 'Будущее отметить нельзя' }, { status: 400 });
  }

  try {
    if (done === false) {
      await prisma.ownerPracticeTick.deleteMany({ where: { key, date: at } });
      return NextResponse.json({ status: 'ok', done: false });
    }

    // Повторное нажатие не плодит строки и не накручивает серию.
    await prisma.ownerPracticeTick.upsert({
      where: { key_date: { key, date: at } },
      create: { key, date: at },
      update: {},
    });

    return NextResponse.json({ status: 'ok', done: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, stateSchema);
  if (!parsed.ok) return parsed.response;

  const { key, status, rhythm, note } = parsed.data;
  if (!PRACTICE_BY_KEY.has(key)) {
    return NextResponse.json({ error: 'Нет такой практики' }, { status: 404 });
  }
  if (rhythm != null && !isRhythm(rhythm)) {
    return NextResponse.json({ error: 'Неизвестный ритм' }, { status: 400 });
  }

  try {
    const data = {
      ...(status === undefined ? {} : { status }),
      ...(rhythm === undefined ? {} : { rhythm }),
      ...(note === undefined ? {} : { note }),
    };

    const saved = await prisma.ownerPracticeState.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });

    return NextResponse.json({ status: 'ok', state: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
