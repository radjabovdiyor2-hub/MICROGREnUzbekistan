import type { Message } from './aiChatConfig';

// Умения ИИ-чата, не связанные с разметкой: копирование, шаринг и
// распознавание речи. Вынесено из AiChatWidget: файл перерос 200 строк.

const shareText = (msg: Message) =>
  `Microgreen Agro:

${msg.content}

Buyurtma: +998 94 999 95 99
Microgreen.uz`;

/** Буфер обмена недоступен в незащищённом контексте — отсюда запасной путь. */
export async function copyToClipboard(msg: Message): Promise<void> {
  const text = shareText(msg);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/** Системный шаринг, а где его нет — копирование. */
export async function shareMessageText(msg: Message): Promise<void> {
  const text = shareText(msg);
  if (navigator.share) {
    try {
      await navigator.share({ text, title: 'Microgreen Agro' });
      return;
    } catch { /* пользователь закрыл окно шаринга */ }
  }
  await copyToClipboard(msg);
}

/** Распознавание речи. Типы Web Speech API объявлены в src/types/telegram.d.ts. */
export function startSpeechRecognition(
  onStart: () => void,
  onText: (text: string) => void,
  onEnd: () => void,
): boolean {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;
  const r = new SR();
  r.lang = 'uz-UZ';
  r.interimResults = false;
  r.onstart = onStart;
  r.onresult = (e: SpeechRecognitionEvent) => { onText(e.results[0][0].transcript); onEnd(); };
  r.onerror = onEnd;
  r.onend = onEnd;
  r.start();
  return true;
}
