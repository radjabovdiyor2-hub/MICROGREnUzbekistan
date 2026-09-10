import { prisma } from '@repo/database';

import { startOfLocalDay } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Открыть и закрыть смену.
//
// СОСТОЯНИЕ СМЕНЫ ЖИВЁТ НА СЕРВЕРЕ, а не в памяти вкладки. До этого
// запись дня включалась флагом в `localStorage`, и о нём знала только та
// вкладка, где нажали: открыть смену в боте и увидеть это в PWA было
// нельзя. Смену открывают из трёх мест, значит правда о ней может быть
// только одна и общая.
//
// ОДНА СТРОКА НА ДЕНЬ, А НЕ ВТОРАЯ РЯДОМ. Владелец заводит смену в
// графике заранее; «начал» дописывает в неё время, а не создаёт вторую.
// Иначе план и факт разошлись бы, и стало бы непонятно, какую из двух
// считать. Уникального ключа в таблице при этом нет намеренно — см.
// `schema.prisma`, там объяснено почему.
// ══════════════════════════════════════════════════════════════════════

/** Откуда открыли смену. Больше вариантов не бывает и не должно. */
export const SHIFT_SOURCES = ['pwa', 'bot', 'web'] as const;
export type ShiftSource = (typeof SHIFT_SOURCES)[number];

export function isShiftSource(value: unknown): value is ShiftSource {
  return typeof value === 'string' && (SHIFT_SOURCES as readonly string[]).includes(value);
}

export interface OpenShift {
  id: string;
  startedAt: Date;
  openedVia: string | null;
}

/**
 * Открытая смена этого человека на сегодня.
 *
 * «Открытая» — начата и не закрыта. Смена, назначенная в графике на
 * сегодня, но не начатая, открытой НЕ считается: это план.
 */
export async function currentShift(employeeId: string, now: Date): Promise<OpenShift | null> {
  const shift = await prisma.shift.findFirst({
    where: {
      employeeId,
      date: startOfLocalDay(now),
      type: 'work',
      startTime: { not: null },
      endTime: null,
    },
    select: { id: true, startTime: true, openedVia: true },
    orderBy: { startTime: 'desc' },
  });
  if (!shift || shift.startTime === null) return null;
  return { id: shift.id, startedAt: shift.startTime, openedVia: shift.openedVia };
}

/**
 * Открыть смену. Повторное открытие возвращает уже открытую.
 *
 * ПОВТОР БЕЗОПАСЕН НАМЕРЕННО. Человек нажимает кнопку в боте, не увидев,
 * что уже нажал её в приложении; связь моргает и запрос уходит дважды.
 * Отвечать ошибкой на это значит пугать человека там, где всё в порядке.
 */
export async function openShift(
  employeeId: string,
  now: Date,
  via: ShiftSource,
): Promise<OpenShift> {
  const already = await currentShift(employeeId, now);
  if (already) return already;

  const date = startOfLocalDay(now);
  // Смена на сегодня могла быть заведена владельцем в графике. Дописываем
  // её, а не заводим вторую.
  const planned = await prisma.shift.findFirst({
    where: { employeeId, date, type: 'work', startTime: null },
    select: { id: true },
  });

  const shift = planned
    ? await prisma.shift.update({
        where: { id: planned.id },
        data: { startTime: now, endTime: null, openedVia: via, closedAuto: false },
        select: { id: true, startTime: true, openedVia: true },
      })
    : await prisma.shift.create({
        data: { employeeId, date, type: 'work', startTime: now, openedVia: via },
        select: { id: true, startTime: true, openedVia: true },
      });

  return { id: shift.id, startedAt: shift.startTime ?? now, openedVia: shift.openedVia };
}

/**
 * Закрыть смену. `null` — закрывать было нечего.
 *
 * `closedAuto` ставит вечерний проход, а не человек: время, поставленное
 * автоматом, — повод спросить, а не установленный факт.
 */
export async function closeShift(
  employeeId: string,
  now: Date,
  endedAt: Date = now,
  auto = false,
): Promise<{ id: string; startedAt: Date; endedAt: Date } | null> {
  const open = await currentShift(employeeId, now);
  if (!open) return null;

  // Конец раньше начала — сбитые часы или ошибка вызова. Нулевая
  // длительность честнее отрицательной: она не превращается в
  // отрицательные часы там, где их однажды начнут считать.
  const end = endedAt < open.startedAt ? open.startedAt : endedAt;

  await prisma.shift.update({
    where: { id: open.id },
    data: { endTime: end, closedAuto: auto },
  });
  return { id: open.id, startedAt: open.startedAt, endedAt: end };
}
