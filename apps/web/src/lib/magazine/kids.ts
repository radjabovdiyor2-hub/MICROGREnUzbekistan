// ════════════════════════════════════════════════════════════
// Детская экосистема FRESH WEEKLY — каталог 9 механик.
// online — интерактивная веб-страница; ar — WebAR; print — в журнале;
// bot — через Telegram-бота.
// ════════════════════════════════════════════════════════════
import type { KidsMechanic } from './types';
import { KIDS_MECHANIC_LABELS } from './types';

export type KidsMode = 'online' | 'ar' | 'print' | 'bot';

export interface KidsMechanicInfo {
  id: KidsMechanic;
  emoji: string;
  label: string;
  desc: string;
  mode: KidsMode;
  href?: string; // ссылка (online/ar/bot)
}

const BOT_URL = 'https://t.me/fresh_weekly_uz';

export const KIDS_MECHANICS: KidsMechanicInfo[] = [
  { id: 'neuro_tale', emoji: '📖', label: KIDS_MECHANIC_LABELS.neuro_tale, mode: 'online', href: '/magazine/kids/tale',
    desc: 'ИИ сочинит сказку про Росточка с именем твоего ребёнка.' },
  { id: 'voice_riddle', emoji: '🔊', label: KIDS_MECHANIC_LABELS.voice_riddle, mode: 'online', href: '/magazine/kids/riddles',
    desc: 'Слушай загадку и отвечай голосом — Агроном проверит.' },
  { id: 'agronom_passport', emoji: '🛂', label: KIDS_MECHANIC_LABELS.agronom_passport, mode: 'online', href: '/magazine/kids/passport',
    desc: 'Отмечай полезные привычки и собирай печати агронома.' },
  { id: 'ar_coloring', emoji: '🎨', label: KIDS_MECHANIC_LABELS.ar_coloring, mode: 'ar', href: '/magazine/ar',
    desc: 'Раскрась героя — и он оживёт в 3D через камеру.' },
  { id: 'speech_ar', emoji: '🗣️', label: KIDS_MECHANIC_LABELS.speech_ar, mode: 'ar', href: '/magazine/ar',
    desc: '3D-овощи помогают правильно произносить звуки.' },
  { id: 'asmr_crunch', emoji: '🎧', label: KIDS_MECHANIC_LABELS.asmr_crunch, mode: 'bot', href: BOT_URL,
    desc: 'Запиши хруст морковки и отправь боту — попади в топ!' },
  { id: 'food_art', emoji: '🍎', label: KIDS_MECHANIC_LABELS.food_art, mode: 'print',
    desc: 'Собери мордочку зверя из еды по инструкции в журнале.' },
  { id: 'plant_quest', emoji: '🌱', label: KIDS_MECHANIC_LABELS.plant_quest, mode: 'print',
    desc: 'Посади семена из подарка к журналу и вырасти урожай.' },
  { id: 'board_game', emoji: '🎲', label: KIDS_MECHANIC_LABELS.board_game, mode: 'print',
    desc: 'Настолка «Путь Росточка» — поле на развороте журнала.' },
];

export function kidsMechanicById(id: KidsMechanic): KidsMechanicInfo | undefined {
  return KIDS_MECHANICS.find((m) => m.id === id);
}
