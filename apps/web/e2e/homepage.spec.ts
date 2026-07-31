import { test, expect } from "./fixtures";

// Сценарии писались под старую версию витрины и с тех пор ни разу не гонялись:
// в CI стоит только vitest, а локально Playwright не поднимался, потому что
// postgres наружу не опубликован. Проверка 31.07.2026 запустила их против
// контейнера и нашла, что все ожидания устарели: заголовок сменился на
// SEO-строку под узбекский рынок, магазин переехал с /shop на /catalog,
// noscript-блока в разметке больше нет вовсе. Приведено к текущему сайту.

test.describe("Homepage", () => {
    test("renders hero section with title", async ({ page }) => {
        await page.goto("/");
        await expect(page).toHaveTitle(/Microgreen Uzbekistan/);
        await expect(page.locator("body")).toBeVisible();
    });

    test("navigation links are visible on desktop", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("header#main-header")).toBeVisible();
    });

    test("catalog link navigates to catalog", async ({ page }) => {
        await page.goto("/");
        // Ждём клиентской отрисовки товаров — признак завершённой гидратации.
        // Клик до неё уходит в ещё не подключённый роутер Next, и элемент
        // заменяется прямо под курсором («element was detached from the DOM»).
        await page.locator('a[href^="/product/"]').first().waitFor({ timeout: 20_000 });

        // Ссылок на каталог несколько (шапка, нижняя навигация, плитки рубрик),
        // и часть из них скрыта под текущий размер экрана: на мобильном первой
        // в DOM идёт ссылка десктопной шапки, кликнуть её нельзя. Берём первую
        // ВИДИМУЮ, иначе сценарий зелёный на десктопе и красный на телефоне.
        await page.locator('a[href="/catalog"]:visible').first().click();
        await expect(page).toHaveURL(/\/catalog/);
    });

    test("has JSON-LD structured data", async ({ page }) => {
        await page.goto("/");
        const jsonLd = page.locator('script[type="application/ld+json"]');
        await expect(jsonLd.first()).toBeAttached();
    });

    test("category tiles link into catalog sections", async ({ page }) => {
        await page.goto("/");
        // Раньше здесь проверялся noscript-фолбэк, которого в разметке нет.
        // Полезнее убедиться, что рубрики каталога разведены по разделам:
        // именно они — точка входа в товары с главной.
        const tiles = page.locator('a[href^="/catalog/"]');
        expect(await tiles.count()).toBeGreaterThan(0);
    });
});
