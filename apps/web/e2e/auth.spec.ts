import { test, expect } from "./fixtures";

// Прежние сценарии ходили на /login и ждали редиректа туда с /admin. Такой
// страницы в приложении нет вовсе (проверка 31.07.2026: /login → 404), вход
// владельца живёт внутри /admin и держится на подписанной httpOnly-куке.
// Проверяем то, что действительно защищает данные, — рубеж на API.

test.describe("Доступ в админку", () => {
    test("страница админки открывается и не отдаёт данные без входа", async ({ page }) => {
        const res = await page.goto("/admin");
        expect(res?.status()).toBe(200);
        // Оболочка рендерится всегда, но сами данные приходят из /api/admin,
        // а он закрыт. В HTML не должно быть ни заказов, ни клиентов.
        const html = await page.content();
        expect(html).not.toMatch(/orderNumber|bonusBalance|totalSpent/);
    });

    test("API админки без сессии отвечает 401", async ({ request }) => {
        for (const path of ["/api/admin/bots", "/api/admin/customers", "/api/admin/orders"]) {
            const res = await request.get(path);
            expect(res.status(), `${path} должен требовать авторизацию`).toBe(401);
        }
    });

    test("каталог читается всеми, но запись закрыта", async ({ request }) => {
        // Правило middleware: /api/products закрыт только на запись.
        const read = await request.get("/api/products?limit=1");
        expect(read.status()).toBe(200);

        const write = await request.post("/api/products", { data: { nameUz: "e2e" } });
        expect(write.status()).toBe(401);
    });
});
