import { test, expect } from "./fixtures";

/**
 * Ресурсы карты приезжают, а не отваливаются в 404.
 *
 * СЛУЧАЙ, РАДИ КОТОРОГО ЭТОТ СЦЕНАРИЙ НАПИСАН
 *
 * 18.08.2026 карта на бою показывала ровный чёрный прямоугольник, и ни
 * одна проверка этого не увидела: сборка, типы, юнит-тесты, линтер и даже
 * Playwright были зелёными. Ломался Web Worker, который разбирает
 * векторные тайлы: Turbopack вынес его в static/media/ с хешем в имени, а
 * его спутника — с другим хешем, тогда как воркер импортирует спутника
 * относительным путём без хеша. Импорт ушёл в 404.
 *
 * Пиксели канваса здесь намеренно НЕ проверяются: WebGL в headless
 * Chromium идёт через SwiftShader и склонен к ложным падениям. А вот 404
 * на своём же ресурсе ловится надёжно — и это ровно наш класс ошибки.
 *
 * Внешние тайлы не проверяем: фикстура обрывает запросы за пределы стенда
 * (см. fixtures.ts), и доступность чужого CDN к предмету не относится.
 */

const WORKER = "/maplibre/maplibre-gl-worker.mjs";

test.describe("Ресурсы карты", () => {
    test("воркер MapLibre отдаётся с главной, а не 404", async ({ page }) => {
        const mapResponses: { url: string; status: number }[] = [];

        page.on("response", (res) => {
            if (res.url().includes("/maplibre/")) {
                mapResponses.push({ url: new URL(res.url()).pathname, status: res.status() });
            }
        });

        await page.goto("/");
        // Карта магазина грузится через next/dynamic, поэтому ждём именно
        // ответ, а не произвольный таймаут.
        await page.waitForResponse((res) => res.url().includes(WORKER), { timeout: 20_000 });

        // Запрос обязан был случиться: сценарий, который «не нашёл ошибок»,
        // потому что карта вообще не монтировалась, ничего не проверяет.
        expect(mapResponses.length).toBeGreaterThan(0);

        const broken = mapResponses.filter((r) => r.status >= 400);
        expect(broken, `ресурсы карты отвалились: ${JSON.stringify(broken)}`).toEqual([]);
    });

    test("спутник воркера лежит там, где воркер его ищет", async ({ page }) => {
        // Воркер импортирует './maplibre-gl-shared.mjs' относительным путём.
        // Проверяем сам путь: именно его расхождение с реальным именем файла
        // и погасило карту.
        const res = await page.request.get("/maplibre/maplibre-gl-shared.mjs");
        expect(res.status()).toBe(200);
        expect(res.headers()["content-type"] ?? "").toMatch(/javascript/);
    });
});
