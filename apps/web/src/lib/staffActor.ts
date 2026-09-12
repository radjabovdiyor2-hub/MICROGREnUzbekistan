import type { NextRequest } from 'next/server';

import { getSession } from '@/lib/adminAuth';
import { requireBotAuth } from '@/lib/botAuth';
import { deviceHolder } from '@/lib/deviceAuth';
import { resolveEmployee, type EmployeeRef, type ResolvedEmployee } from '@/lib/tracking/fieldDay';

// ══════════════════════════════════════════════════════════════════════
// Кто обращается — один разбор на все двери сотрудника.
//
// ТРИ ДОРОГИ ВНУТРЬ, и у каждой своя причина:
//   · сессия сотрудника — из приложения и из веба;
//   · ключ устройства — из приложения на Android: фоновая служба должна
//     работать, когда сессии давно нет;
//   · ботовый секрет плюс `telegramId` — из Telegram.
//
// КТО ЭТО, БЕРЁМ ИЗ ПОДПИСИ, А НЕ ИЗ ТЕЛА. Телу здесь верить нельзя ровно по
// той же причине, по которой расстояние до клиента считает сервер: тело
// пишет тот, чью добросовестность мы и проверяем.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Разбор был написан внутри `/api/shift`, и второй
// двери сотрудника пришлось бы его повторить. Повторённый рубеж расходится:
// одну дверь поправят, другую забудут — и та, что забыли, окажется мягче.
// Здесь он один, и поведение перенесено дословно.
//
// Какие из трёх дорог реально открыты конкретному адресу, решает не этот
// модуль, а `middleware.ts`: ключ устройства работает только на путях из
// `DEVICE_PATHS`, и ворота остаются в одном месте.
// ══════════════════════════════════════════════════════════════════════

/** Кто обращается, либо готовый отказ с кодом и словами для человека. */
export async function staffActor(
  request: NextRequest,
  body: Record<string, unknown> | null,
): Promise<ResolvedEmployee | { error: string; status: number }> {
  const session = getSession(request);
  let ref: EmployeeRef | null = null;

  if (session && (session.role === 'ADMIN' || session.role === 'SELLER') && session.name) {
    ref = { name: session.name };
  } else {
    // Ключ устройства называет человека прямо и уже проверен по отпечатку —
    // ни имени, ни `telegramId` спрашивать не нужно.
    const device = await deviceHolder(request);
    if (device) {
      return { id: device.employeeId, name: device.name, telegramId: device.telegramId };
    }
  }

  if (!ref && requireBotAuth(request)) {
    // `telegramId` приходит строкой намеренно: JSON теряет точность на
    // больших id.
    //
    // ИЩЕМ И В ТЕЛЕ, И В АДРЕСЕ. У запроса состояния (`GET`) тела нет вовсе,
    // и бот передаёт номер параметром. Первая версия читала только тело — и
    // бот не мог узнать, открыта ли смена: дверь отвечала «не указан
    // telegramId» на совершенно правильный запрос.
    const raw = body?.telegramId ?? request.nextUrl.searchParams.get('telegramId');
    const asText = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
    if (!/^\d{1,19}$/.test(asText)) return { error: 'Не указан telegramId', status: 400 };
    ref = { telegramId: BigInt(asText) };
  }

  // Словами, а не «Unauthorized»: это сообщение видит человек в поле, и оно
  // должно говорить, ЧТО ДЕЛАТЬ.
  if (!ref) return { error: 'Сессия истекла — войдите заново', status: 401 };

  const employee = await resolveEmployee(ref);
  // 403, а не 404: уволенный и несуществующий должны выглядеть одинаково,
  // иначе ответ расскажет постороннему, кто в штате.
  if ('error' in employee) return { error: employee.error, status: 403 };
  return employee;
}
