// ══════════════════════════════════════════════════════════════════════
// Отметка визита одним вызовом: отправить, а без связи — запомнить.
//
// Отметок теперь две штуки: кнопки «Съездил — отметь» и автоматическая
// после продажи с точки. Правило «4xx — это отказ, а не отсутствие связи»
// должно быть у обеих одинаковым, иначе продажа однажды потеряет визит
// там, где кнопка его сохранила бы.
// ══════════════════════════════════════════════════════════════════════

export interface VisitQueueLike {
  remember: (visit: { customerId: number; type: string; note: string }) => void;
}

export interface VisitInput {
  customerId: number;
  type: string;
  note: string;
}

export type VisitOutcomeState = 'sent' | 'queued';

/**
 * Отметить визит.
 *
 * Возвращает `queued`, если связи не было: человек уже съездил, и терять
 * именно ту запись, ради которой он ехал, нельзя.
 *
 * Бросает, если сервер ОТКАЗАЛ (400, 403): повторять такое в очереди
 * бессмысленно — отметка негодна, и человек должен об этом узнать.
 */
export async function markVisit(
  input: VisitInput,
  queue: VisitQueueLike,
): Promise<VisitOutcomeState> {
  let res: Response;
  try {
    res = await fetch('/api/admin/customers/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, visitedAt: Date.now() }),
    });
  } catch {
    queue.remember(input);
    return 'queued';
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || 'Не удалось отметить визит');
  }
  return 'sent';
}
