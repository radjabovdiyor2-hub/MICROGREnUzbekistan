import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Сторож: первый визит не заканчивается перезагрузкой.
//
// Воркер ставит себя `skipWaiting` + `clients.claim()` и шлёт вкладкам
// «обновись». На повторном заходе это верно, на ПЕРВОМ — нет: страницу
// только что скачали из сети, свежее уже некуда. Перезагрузка заставляла
// браузер пройти весь круг заново, и замер главной показывал каждый
// запрос дважды: 6,3 МБ и 36 секунд вместо половины.
//
// Ошибок при этом не возникало ни одной, поэтому проверка смотрит на
// исходник: признак «был ли управляющий воркер ДО регистрации» обязан
// сниматься и обязан гасить перезагрузку.
// ══════════════════════════════════════════════════════════════════════

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/providers/PwaRegister.tsx'),
  'utf8',
);

describe('регистрация воркера', () => {
  it('снимает признак «уже был воркер» до регистрации', () => {
    const snapshot = SOURCE.indexOf('navigator.serviceWorker.controller');
    const register = SOURCE.indexOf('.register(');
    expect(snapshot, 'признак не снимается вовсе').toBeGreaterThan(-1);
    expect(snapshot, 'снят после регистрации — там он уже не отличит первый визит').toBeLessThan(
      register,
    );
  });

  it('перезагрузка закрыта этим признаком', () => {
    // Иначе первая же установка отправляет вкладку на второй круг.
    expect(SOURCE).toMatch(/if\s*\([^)]*!hadController[^)]*\)\s*return/);
  });

  it('перезагрузка одна на страницу, а не по сигналу', () => {
    // Сигналов о новой версии два — состояние воркера и его сообщение, —
    // и оба приходят на одно событие.
    expect(SOURCE).toContain('reloading');
    expect((SOURCE.match(/window\.location\.reload\(\)/g) ?? []).length).toBe(1);
  });

  it('слушатель сообщений снимается при размонтировании', () => {
    expect(SOURCE).toContain('removeEventListener');
  });
});

describe('картинки Instagram', () => {
  const grid = readFileSync(
    join(process.cwd(), 'src/components/home/InstagramGrid.tsx'),
    'utf8',
  );

  it('не помечены `unoptimized` — CDN отдаёт исходники по 400 КБ', () => {
    expect(grid).not.toMatch(/^\s*unoptimized/m);
  });

  it('ширина отрисовки объявлена — без неё оптимизатор берёт максимум', () => {
    expect(grid).toContain('sizes=');
  });
});
