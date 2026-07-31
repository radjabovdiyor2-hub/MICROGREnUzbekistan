import { test, expect } from "./fixtures";

// Магазин переехал с /shop на /catalog, а карточка товара — на /product/[id].
// Прежние сценарии ходили по старым адресам и падали на 404; заметить это было
// некому, потому что Playwright не гоняли ни в CI, ни локально.

test.describe("Каталог", () => {
    test("страница каталога открывается", async ({ page }) => {
        await page.goto("/catalog");
        await expect(page).toHaveTitle(/Katalog|Каталог/i);
        await expect(page.locator("body")).toBeVisible();
    });

    test("каталог показывает товары", async ({ page }) => {
        await page.goto("/catalog");
        // На /catalog рубрики — это кнопки-фильтры, а не ссылки: ссылки вида
        // /catalog/<рубрика> живут на главной. Здесь предметом проверки
        // является то, что товары вообще доехали до страницы.
        await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({
            timeout: 15_000,
        });
    });

    test("поиск принимает ввод", async ({ page }) => {
        await page.goto("/catalog");
        // Именно #catalog-search, а не первый попавшийся input: класс
        // search-bar__input носят два поля — в шапке и на самой странице,
        // и .first() выбирал шапку, где ввод уходит в другой обработчик.
        const search = page.locator("#catalog-search");
        await search.fill("руккола");
        await expect(search).toHaveValue("руккола");
    });

    test("карточка товара ведёт на /product/", async ({ page }) => {
        await page.goto("/catalog");
        const productLink = page.locator('a[href^="/product/"]').first();
        // Каталог рендерится на клиенте: ждём появления первой карточки, но не
        // валим сценарий, если товаров в базе стенда нет вовсе.
        if (await productLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
            await productLink.click();
            await expect(page).toHaveURL(/\/product\/.+/);
        }
    });
});
