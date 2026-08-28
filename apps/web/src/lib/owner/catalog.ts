import type { Practice } from './practices';
import { TIME_PRACTICES } from './catalog-time';
import { MONEY_PRACTICES } from './catalog-money';
import { MIND_PRACTICES } from './catalog-mind';
import { TEAM_PRACTICES } from './catalog-team';

// Каталог целиком. Разложен по файлам областей, потому что одним куском
// это две тысячи строк данных, в которых правку не найти.

export const PRACTICES: Practice[] = [
  ...TIME_PRACTICES,
  ...MONEY_PRACTICES,
  ...MIND_PRACTICES,
  ...TEAM_PRACTICES,
];

export const PRACTICE_BY_KEY = new Map(PRACTICES.map((p) => [p.key, p]));
