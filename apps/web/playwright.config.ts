import { defineConfig, devices } from "@playwright/test";

// Адрес стенда. По умолчанию — локальный dev-сервер, как было. Переменная нужна,
// чтобы гонять те же сценарии против уже поднятого контейнера: postgres наружу
// не опубликован, поэтому `npm run dev` с хоста до базы не достаёт, а
// контейнер mg_web работает и слушает свой порт. Задан PLAYWRIGHT_BASE_URL —
// свой сервер не поднимаем, идём в указанный.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const USE_EXTERNAL = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        // Страница подтягивает шрифты Google, и `load` не наступает, пока они
        // не приедут. На медленном канале это 5+ секунд на запрос, и сценарии
        // валились по таймауту навигации, хотя сам сервер отвечал за 0.3 с.
        // Проверяем разметку, а не скорость внешнего CDN.
        navigationTimeout: 60_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "mobile",
            use: { ...devices["Pixel 5"] },
        },
    ],
    webServer: USE_EXTERNAL
        ? undefined
        : {
              command: "npm run dev",
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
          },
});
