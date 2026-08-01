import { tokensGlobal, tokensLight } from '@tokens';

// ══════════════════════════════════════════════════════════════════════
// Токены для Canvas 2D и Satori.
//
// ctx.fillStyle и рендерер OG-картинок работают вне каскада CSS: var()
// там не резолвится, и цвета приходилось писать литералом. Значения берём
// из того же tokens.json, что и остальной сайт, — через сгенерированный
// build/tokens.ts, который для этого и заведён.
//
// Тема здесь не участвует намеренно: кадр гостя и OG-картинка рисуются
// поверх фотографии, у них своя подложка. Берём светлый набор как
// канонические значения бренда.
// ══════════════════════════════════════════════════════════════════════

const VALUES: Record<string, string> = { ...tokensGlobal, ...tokensLight };

/** Значение токена по имени CSS-переменной без `--`. */
export function token(name: keyof typeof tokensGlobal | keyof typeof tokensLight): string {
  const value = VALUES[name];
  if (!value) throw new Error(`Неизвестный токен: ${name}`);
  return value;
}

/** Цвет с прозрачностью из канального токена: alpha('overlay-light-rgb', 0.55). */
export function alpha(channel: 'overlay-light-rgb' | 'overlay-dark-rgb' | 'brand-primary-rgb', a: number): string {
  return `rgba(${VALUES[channel]}, ${a})`;
}

/** Сплошной цвет из канального токена. */
export function solid(channel: 'overlay-light-rgb' | 'overlay-dark-rgb'): string {
  return `rgb(${VALUES[channel]})`;
}
