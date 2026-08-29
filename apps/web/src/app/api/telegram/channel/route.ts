import { NextRequest, NextResponse } from 'next/server';

import { requireBotAuth } from '@/lib/botAuth';

// ══════════════════════════════════════════════════════════════════════
// Публикация в Telegram: POST /api/telegram/channel
//
// Дверь одного издателя. Публикацией владеет офис
// (`apps/tgas/shared/publisher.py`): у него генерация, бренд-стиль, учёт
// опубликованного и Instagram. Но токен витринного бота живёт здесь, а
// прямых импортов между модулями быть не может — поэтому офис публикует
// в канал через эту дверь.
//
// Правило доступа — `/api/telegram` (ADMIN) в middleware; офис приходит с
// `BOT_SECRET`. Проверка повторена в роуте: за этой дверью — рассылка
// подписчикам, а отправленное не отзывается.
// ══════════════════════════════════════════════════════════════════════

/** Куда публикуем. Больше адресов у витринного бота нет. */
type Target = 'channel' | 'group';

function chatIdFor(target: Target): string | undefined {
  return target === 'group' ? process.env.GROUP_ID : process.env.CHANNEL_ID;
}

/** Эмодзи по типу сообщения — общий вид постов канала. */
const TYPE_EMOJI: Record<string, string> = {
  promo: '🎉',
  update: '🔔',
  news: '📰',
};

export async function POST(request: NextRequest) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, title, description, photoUrl } = body;
    const target: Target = body.target === 'group' ? 'group' : 'channel';

    if (!title) {
      return NextResponse.json({ error: 'title required' }, { status: 400 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = chatIdFor(target);

    if (!token || !chatId) {
      // Честный отказ, а не «успешно опубликовано»: без адреса группы пост
      // не выйдет никуда, и издатель обязан это узнать.
      return NextResponse.json(
        { error: `TELEGRAM_BOT_TOKEN или адрес «${target}» не настроен` },
        { status: 500 },
      );
    }

    const emoji = TYPE_EMOJI[type] ?? '📢';
    const text = `${emoji} <b>${title}</b>\n\n${description || ''}`;

    // Подпись под фото у Telegram ограничена 1024 символами против 4096 у
    // сообщения. Длинный текст с картинкой уходил бы с ошибкой целиком —
    // отправляем его отдельным сообщением.
    const asPhoto = Boolean(photoUrl) && text.length <= 1024;
    const method = asPhoto ? 'sendPhoto' : 'sendMessage';
    const payload = asPhoto
      ? { chat_id: chatId, photo: photoUrl, caption: text, parse_mode: 'HTML' }
      : { chat_id: chatId, text, parse_mode: 'HTML' };

    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Channel Post] Telegram API error:', err);
      return NextResponse.json({ error: 'Telegram API error' }, { status: 502 });
    }

    return NextResponse.json({ success: true, target, withPhoto: asPhoto });
  } catch (error) {
    console.error('[Channel Post] Error:', error);
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 });
  }
}
