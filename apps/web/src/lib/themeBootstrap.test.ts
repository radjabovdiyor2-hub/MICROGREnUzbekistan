import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { THEME_BOOTSTRAP, THEME_BOOTSTRAP_HASH } from './themeBootstrap';

// ══════════════════════════════════════════════════════════════════════
// Хеш скрипта темы обязан совпадать с самим скриптом.
//
// Разрешение на исполнение выдаёт CSP по хешу — nonce'а мало, он
// запекается пустым на статически собранных страницах каталога. Значит
// расхождение хеша и скрипта выключает тему на четырёх главных страницах
// SEO, и НИЧЕГО не ломает больше: ни ошибки сборки, ни красного экрана,
// одна строка в консоли браузера про Content Security Policy.
//
// Посчитать хеш в самом модуле нельзя: его читает middleware, а тот живёт
// в Edge, где `node:crypto` не существует. Поэтому сверку делает тест —
// он-то в Node.
// ══════════════════════════════════════════════════════════════════════

describe('скрипт темы и его хеш', () => {
  it('хеш посчитан по тому самому скрипту', () => {
    const actual = createHash('sha256').update(THEME_BOOTSTRAP, 'utf8').digest('base64');
    expect(THEME_BOOTSTRAP_HASH).toBe(`'sha256-${actual}'`);
  });

  it('скрипт ставит атрибут темы до отрисовки и переживает отказ хранилища', () => {
    // localStorage бросает в приватном окне и при запрете сайту хранить
    // данные. Без catch страница осталась бы вовсе без темы.
    expect(THEME_BOOTSTRAP).toContain('data-theme');
    expect(THEME_BOOTSTRAP).toContain('catch');
    expect(THEME_BOOTSTRAP).toContain('prefers-color-scheme:dark');
  });
});
