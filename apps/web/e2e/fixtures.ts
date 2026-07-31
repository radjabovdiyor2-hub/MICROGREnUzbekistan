import { test as base, expect } from "@playwright/test";

/**
 * Общая фикстура e2e: гасит запросы на чужие хосты.
 *
 * Витрина подключает шрифты Google через @import в globals.css. Браузер не
 * поднимает событие `load`, пока они не приедут, а на медленном канале это
 * 5+ секунд на запрос — сценарии валились по таймауту, хотя сервер отвечал
 * за 0.3 секунды. Проверка 31.07.2026 нашла именно это: 20 падений из 26 не
 * имели отношения к коду.
 *
 * Внешние ресурсы к предмету проверки не относятся: мы смотрим разметку и
 * рубежи авторизации, а не доступность чужого CDN. Поэтому всё, что уходит
 * за пределы стенда, обрывается сразу.
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        await page.route("**/*", (route) => {
            const url = new URL(route.request().url());
            const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
            return isLocal ? route.continue() : route.abort();
        });
        await use(page);
    },
});

export { expect };
