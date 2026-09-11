import { describe, expect, it, vi } from 'vitest';

import { webglMissing, webglMissingIn, type CanvasMaker } from './webgl';

// ══════════════════════════════════════════════════════════════════════
// Проба WebGL. Она решает, скажет ли экран словами, почему нет карты.
//
// Проверяется ровно одно: «контекста нет» и «вопрос бросил исключение»
// дают ОДИН ответ — карты не будет. Разойдись они, и владелец снова
// получил бы пустой прямоугольник без объяснения.
// ══════════════════════════════════════════════════════════════════════

function docGiving(context: unknown): CanvasMaker {
  return { createElement: () => ({ getContext: () => context }) };
}

describe('webglMissingIn', () => {
  it('контекст есть — карту поднимать можно', () => {
    expect(webglMissingIn(docGiving({}))).toBe(false);
  });

  it('контекста нет — говорим, что нет', () => {
    expect(webglMissingIn(docGiving(null))).toBe(true);
  });

  it('проба бросила — это тоже «нет», а не молчание', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const doc: CanvasMaker = {
      createElement: () => {
        throw new Error('canvas запрещён');
      },
    };
    expect(webglMissingIn(doc)).toBe(true);
    vi.restoreAllMocks();
  });

  it('на сервере отказа не объявляем — там и экрана нет', () => {
    expect(webglMissingIn(undefined)).toBe(false);
  });
});

describe('webglMissing', () => {
  it('без документа не падает и не врёт про отказ', () => {
    // Набор гоняется в окружении `node`: документа здесь нет вовсе, и это
    // тот же случай, что серверная отрисовка.
    expect(webglMissing()).toBe(false);
  });
});
