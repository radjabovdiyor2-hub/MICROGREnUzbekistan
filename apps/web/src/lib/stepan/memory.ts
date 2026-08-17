import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Общая память ассистента: одна нить разговора на владельца, а не на
// канал.
//
// Было: в админке переписка жила в useState компонента и стиралась при
// перезагрузке вкладки, в Telegram — в FSM-состоянии aiogram и умирала
// вместе с ним. Начатый голосом разговор не был виден в вебе, и наоборот.
//
// Ошибки отсюда НЕ гасятся. Ассистент, который молча отвечает без памяти,
// выглядит для владельца так же, как ассистент с памятью, — и это ровно
// тот класс дефекта, из-за которого «Пульт ИИ» год рапортовал об успехе.
// Вызывающий обязан сказать владельцу, что контекст потерян.
// ══════════════════════════════════════════════════════════════════════

/**
 * Владелец один, поэтому ключ пока постоянный. Когда администраторов
 * станет несколько, сюда придёт их идентификатор: поле выделено отдельно
 * именно ради этого, связать каналы поможет Employee.telegramId.
 */
export const OWNER_KEY = 'owner';

/** Что считаем безопасным ключом комнаты: без пробелов и спецсимволов. */
const SCOPE_RE = /^[A-Za-z0-9:_-]{1,48}$/;

/**
 * Ключ нити для отдельной «комнаты» разговора.
 *
 * Личный чат владельца и админка — ОДНА нить (`owner`): это один и тот же
 * человек продолжает один и тот же разговор, начатый голосом в Telegram и
 * дописанный с ноутбука. А вот рабочая группа — уже другая комната: там
 * говорят менеджеры, и там свои темы. Пока нить была одна на всё, вопрос
 * бота в группе и переписка владельца в личке перемешивались, и модель
 * отвечала на реплику из соседнего разговора.
 *
 * Схема при этом не менялась: `ownerKey` уже был отдельным полем — просто
 * роут всегда подставлял в него константу.
 */
export function conversationKey(scope?: string | null): string {
  if (!scope || scope === OWNER_KEY) return OWNER_KEY;
  if (!SCOPE_RE.test(scope)) return OWNER_KEY;
  return `${OWNER_KEY}:${scope}`;
}

export type MemoryChannel = 'web' | 'telegram';

export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  channel: MemoryChannel;
  toolCalls?: unknown;
  createdAt: Date;
}

/** Сколько последних реплик отдаём модели. */
const TAIL_LIMIT = 20;

/**
 * Верхняя граница по объёму. Одного ограничения по количеству мало:
 * расшифровка длинного голосового — это одна реплика на несколько тысяч
 * знаков, и цикл рассуждения по ней стоит денег.
 */
const TAIL_MAX_CHARS = 12_000;

/** Активная нить владельца; создаётся, если её ещё нет. */
export async function getOrCreateConversation(ownerKey: string = OWNER_KEY): Promise<string> {
  const open = await prisma.assistantConversation.findFirst({
    where: { ownerKey, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  if (open) return open.id;

  const created = await prisma.assistantConversation.create({
    data: { ownerKey },
    select: { id: true },
  });
  return created.id;
}

/**
 * Хвост недавней истории в хронологическом порядке. Порядок задаёт момент
 * записи на сервере, а не на устройстве: владелец может писать с телефона
 * и с ноутбука одновременно, а часы у них расходятся.
 */
export async function loadRecentMessages(ownerKey: string = OWNER_KEY): Promise<MemoryMessage[]> {
  const conversationId = await getOrCreateConversation(ownerKey);

  const rows = await prisma.assistantMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: TAIL_LIMIT,
    select: { role: true, content: true, channel: true, toolCalls: true, createdAt: true },
  });

  const chronological = rows.reverse();

  // Режем с начала: свежие реплики важнее старых, если не всё влезает.
  let total = 0;
  const kept: typeof chronological = [];
  for (let i = chronological.length - 1; i >= 0; i--) {
    const row = chronological[i];
    total += row.content.length;
    if (total > TAIL_MAX_CHARS && kept.length > 0) break;
    kept.unshift(row);
  }

  return kept.map(r => ({
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: r.content,
    channel: r.channel === 'telegram' ? 'telegram' : 'web',
    toolCalls: r.toolCalls ?? undefined,
    createdAt: r.createdAt,
  }));
}

/** Записывает одну реплику в активную нить. */
export async function appendMessage(input: {
  role: 'user' | 'assistant';
  content: string;
  channel: MemoryChannel;
  toolCalls?: unknown;
  ownerKey?: string;
}): Promise<void> {
  const conversationId = await getOrCreateConversation(input.ownerKey ?? OWNER_KEY);

  await prisma.assistantMessage.create({
    data: {
      conversationId,
      role: input.role,
      content: input.content,
      channel: input.channel,
      toolCalls: (input.toolCalls ?? undefined) as never,
    },
  });
}

/**
 * Закрывает текущую нить. Прошлая переписка не удаляется — историю,
 * которую можно подчистить из интерфейса, нельзя использовать для разбора.
 */
export async function startNewConversation(ownerKey: string = OWNER_KEY): Promise<void> {
  await prisma.assistantConversation.updateMany({
    where: { ownerKey, endedAt: null },
    data: { endedAt: new Date() },
  });
}
