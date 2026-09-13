import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures";
import { loginAsSeller, openAdminTab } from "./adminNav";

// ══════════════════════════════════════════════════════════════════════
// «Мой рейс»: отказ двери — это не «рейса нет».
//
// ЧТО ЛОВИТ. Ошибка запроса гасилась молча: экран проверял только «есть ли
// рейс», и любой отказ — истёкшая сессия, упавшая база, обрыв связи —
// приходил водителю одной строкой «на вас сегодня маршрут не назначен».
// Это не пустой экран, это неверный ответ: человек получает разрешение
// ехать домой ровно тогда, когда спросить не удалось.
//
// Сценарием, а не юнит-тестом: ломается здесь проводка «ответ двери →
// строка на экране», а она видна только в браузере.
//
// ЯЗЫК ПРОВЕРЯЕТСЯ ТУТ ЖЕ. Экран был русским целиком, хотя язык в него
// передавался с самого начала, — а это единственный экран, на котором
// узбекский продавец работает весь день.
// ══════════════════════════════════════════════════════════════════════

const ROUTE = [
  {
    id: "r1",
    date: "2026-09-13T04:00:00.000Z",
    status: "pending",
    stops: [
      {
        id: "s1",
        address: "Самарканд, ул. Регистан, 1",
        phone: "+998900000001",
        status: "pending",
        latitude: 39.65,
        longitude: 66.96,
        order: { orderNumber: "1042" },
      },
    ],
  },
];

/** Глушим всё, кроме рейса: предмет проверки — экран, а не соседние двери. */
async function stub(page: Page, deliveries: { status: number; body: unknown }) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/admin/deliveries**", (route) =>
    route.fulfill({ status: deliveries.status, json: deliveries.body }),
  );
}

test.describe("Мой рейс", () => {
  test("дверь отказала — так и написано, а не «маршрут не назначен»", async ({ page }) => {
    await stub(page, { status: 401, body: { error: "unauthorized" } });
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");

    await expect(page.getByText(/Не удалось загрузить маршрут/)).toBeVisible({ timeout: 25_000 });
    // И ровно наоборот: обещания пустого дня быть не должно.
    await expect(page.getByText(/маршрут не назначен/)).toHaveCount(0);
  });

  test("рейса действительно нет — это другой ответ", async ({ page }) => {
    await stub(page, { status: 200, body: [] });
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");

    await expect(page.getByText(/маршрут не назначен/)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Не удалось загрузить/)).toHaveCount(0);
  });

  test("рейс есть — адрес и кнопки отметки на экране", async ({ page }) => {
    await stub(page, { status: 200, body: ROUTE });
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");

    await expect(page.getByText(/ул. Регистан/)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: /Доставлено/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Не застал/ })).toBeVisible();
  });
});
