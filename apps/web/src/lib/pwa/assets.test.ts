import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Сторож приложения: воркер и манифест.
//
// ЗАЧЕМ. Оба файла — обычный текст в `public/`, их не собирает сборщик, не
// проверяет ни компилятор, ни линтер. Ошибка в них не роняет ничего: она
// просто делает так, что уведомление приходит дважды, значок в нём пустой,
// а установка приложения предлагает витрину без картинок.
//
// Три дефекта, которые уже были и держатся этими проверками:
//
//   1. ДВА обработчика `push` и два `notificationclick` в одном файле.
//      Браузер вызывает ВСЕ — значит каждое уведомление показывалось
//      дважды, а клик открывал новое окно и переводил старое. Второй набор
//      добавили, не заметив первого: они лежат в сотне строк друг от друга.
//
//   2. Значок уведомления `/icons/icon-192.png`, которого нет на диске:
//      есть только `.svg`. Уведомление показывается с пустым квадратом.
//
//   3. Манифест ссылался на `/screenshots/home.png`, которого нет.
// ══════════════════════════════════════════════════════════════════════

const PUBLIC = join(process.cwd(), 'public');
const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8'));

/** Сколько раз воркер подписывается на событие. */
function handlers(event: string): number {
  return sw.split(`addEventListener("${event}"`).length - 1;
}

describe('service worker', () => {
  it('на каждое событие — ровно один обработчик', () => {
    // Дубль не ошибка для браузера: он честно вызовет оба.
    for (const event of ['push', 'notificationclick', 'install', 'activate', 'fetch', 'sync']) {
      expect(handlers(event), `обработчиков «${event}»`).toBe(1);
    }
  });

  it('сторож видит подставной дубль', () => {
    const fake = sw + '\nself.addEventListener("push", () => {});\n';
    expect(fake.split('addEventListener("push"').length - 1).toBe(2);
  });

  it('все файлы, на которые ссылается воркер, существуют', () => {
    const refs = [...sw.matchAll(/"(\/(?:icons|images)\/[^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);

    const missing = refs.filter((r) => !existsSync(join(PUBLIC, r)));
    expect(missing, 'воркер ссылается на несуществующие файлы').toEqual([]);
  });

  it('очередь офлайн-заказов переживает смену версии', () => {
    // Чистка старых кэшей сносила всё, кроме версионного, — вместе с
    // заказами, оформленными без сети. Покупка исчезала молча.
    expect(sw).toContain('OFFLINE_QUEUE');
    const activate = sw.slice(sw.indexOf('addEventListener("activate"'));
    const filter = activate.slice(0, activate.indexOf('.map('));
    expect(filter, 'чистка кэшей не щадит очередь заказов').toContain('OFFLINE_QUEUE');
  });

  it('версия кэша объявлена и не пустая', () => {
    expect(sw).toMatch(/const CACHE_NAME = "microgreen-v\d+"/);
  });
});

describe('манифест приложения', () => {
  it('все перечисленные файлы существуют', () => {
    const refs: string[] = [
      ...(manifest.icons ?? []).map((i: { src: string }) => i.src),
      ...(manifest.screenshots ?? []).map((s: { src: string }) => s.src),
      ...(manifest.shortcuts ?? []).flatMap((s: { icons?: { src: string }[] }) =>
        (s.icons ?? []).map((i) => i.src),
      ),
    ];
    expect(refs.length).toBeGreaterThan(0);

    const missing = refs.filter((r) => !existsSync(join(PUBLIC, r)));
    expect(missing, 'манифест обещает файлы, которых нет').toEqual([]);
  });

  it('есть устойчивое имя приложения', () => {
    // Без `id` браузер выводит имя из `start_url`: смена стартового адреса
    // создала бы ВТОРОЕ приложение вместо обновления установленного.
    expect(manifest.id).toBeTruthy();
  });

  it('заполнено то, без чего установка не предлагается', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    // Нужен значок не меньше 192 и не меньше 512 — требование браузеров.
    const sizes = (manifest.icons ?? []).map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('ярлыки ведут на существующие разделы витрины', () => {
    const known = ['/', '/catalog', '/cart', '/profile', '/favorites', '/magazine'];
    for (const s of manifest.shortcuts ?? []) {
      expect(known, `ярлык «${s.name}» ведёт в ${s.url}`).toContain(s.url);
    }
  });
});
