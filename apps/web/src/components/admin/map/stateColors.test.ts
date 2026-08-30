import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SEGMENT_META, SEGMENT_STATES } from '@/lib/customers/segments';

// ══════════════════════════════════════════════════════════════════════
// Два состояния не имеют права краситься одинаково.
//
// ЧТО СЛУЧИЛОСЬ. В тёмной теме `--cat-6` («Замедлился») и `--warning`
// («Под угрозой») были ОДНИМ И ТЕМ ЖЕ `#FBBF24`. На карте и в легенде это
// один цвет на два разных состояния: «пора звонить» и «уже теряем»
// выглядели одинаково — а по этому цвету планируют день.
//
// Заметить такое глазами нельзя: каждый токен по отдельности правильный,
// осмысленно только их СРАВНЕНИЕ. Светлая тема при этом была чистой, то
// есть на экране разработчика всё выглядело верно.
//
// Тем же дефектом болели `cat-2` и `cat-9` — две корзины типов заведений
// в режиме «по типу».
//
// Проверяем ИСХОДНИК токенов, а не собранный CSS: сборка воспроизводима,
// а правят руками именно tokens.json.
// ══════════════════════════════════════════════════════════════════════

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

interface TokenLeaf { $value?: string }
type TokenNode = { [key: string]: TokenNode | TokenLeaf | string };

function tokens(): Record<'light' | 'dark', TokenNode> {
  const raw = readFileSync(join(ROOT, 'design-system', 'tokens', 'tokens.json'), 'utf8');
  return JSON.parse(raw) as Record<'light' | 'dark', TokenNode>;
}

/** Значение токена по пути вида `cat.6` или `warning`. */
function valueAt(theme: TokenNode, path: string): string | null {
  let node: TokenNode | TokenLeaf | string = theme;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as TokenNode)[part];
    if (node === undefined) return null;
  }
  const leaf = node as TokenLeaf;
  return typeof leaf.$value === 'string' ? leaf.$value.toUpperCase() : null;
}

/** `var(--cat-6)` → `cat.6`, `var(--warning)` → `warning`. */
function pathOfToken(token: string): string | null {
  const name = /^var\(--([a-z0-9-]+)\)$/.exec(token.trim())?.[1];
  if (!name) return null;
  const cat = /^cat-(\d+)$/.exec(name);
  return cat ? `cat.${cat[1]}` : name;
}

/** Одинаковые значения внутри набора: цвет → кто его занял. */
function collisions(theme: TokenNode, paths: string[]): Record<string, string[]> {
  const byValue: Record<string, string[]> = {};
  for (const path of paths) {
    const value = valueAt(theme, path);
    if (value === null) continue;
    (byValue[value] ??= []).push(path);
  }
  return Object.fromEntries(Object.entries(byValue).filter(([, keys]) => keys.length > 1));
}

describe('цвета состояний клиента', () => {
  const all = tokens();

  it('у каждого состояния есть токен, и он разбирается', () => {
    for (const state of SEGMENT_STATES) {
      const path = pathOfToken(SEGMENT_META[state].token);
      expect(path, `${state}: токен ${SEGMENT_META[state].token}`).not.toBeNull();
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: два состояния не красятся одним цветом`, () => {
      const paths = SEGMENT_STATES
        .map((s) => pathOfToken(SEGMENT_META[s].token))
        .filter((p): p is string => p !== null);
      expect(collisions(all[theme], paths)).toEqual({});
    });

    it(`${theme}: две корзины типов заведений не красятся одним цветом`, () => {
      // Ровно те токены, которые раздаёт companyTypes через bucketColor:
      // денежная шкала (cat-10..12) и «замедлился» (cat-6) сюда не входят.
      const paths = ['cat.1', 'cat.2', 'cat.3', 'cat.4', 'cat.5', 'cat.7', 'cat.9'];
      expect(collisions(all[theme], paths)).toEqual({});
    });
  }
});
