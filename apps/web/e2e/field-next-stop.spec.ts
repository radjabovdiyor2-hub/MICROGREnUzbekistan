import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures";
import { loginAsSeller, openAdminTab } from "./adminNav";

// ══════════════════════════════════════════════════════════════════════
// «Куда дальше»: проводка от ответа двери до строки на экране.
//
// ЗАЧЕМ СКВОЗНЫМ СЦЕНАРИЕМ. Правило выбора проверяют юнит-тесты
// (`nextStop.test.ts`), запреты — тест двери (`staff/day/route.test.ts`).
// Тихо ломается третье: подсказка посчитана, отдана дверью — и не доехала
// до разметки. Так уже было с `gaps` и с `day.source`, который приходил с
// самого начала и нигде не рисовался.
//
// И отдельно проверяется, что ЗАПРЕТ ГОВОРИТ СЛОВАМИ. Пустая панель
// читается как поломка экрана: человек в поле не должен гадать, почему
// подсказок нет — он должен прочитать, что смена не начата.
// ══════════════════════════════════════════════════════════════════════

const SUGGESTION = {
  status: "ok",
  has: false,
  gate: null,
  gateText: null,
  freshAfterMin: 30,
  text: "На сегодня объезд не назначен.",
  next: [
    {
      point: { id: 5, name: "Ресторан «Регистан»", latitude: 39.65, longitude: 66.96 },
      kind: "plan",
      km: 0.4,
      kmLabel: "400 м",
      reason: "в объезде, точка №1",
      orderIndex: 0,
    },
  ],
};

async function stubDay(page: Page, answer: unknown) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/admin/staff/day**", (route) => route.fulfill({ json: answer }));
}

test.describe("Куда дальше", () => {
  test("подсказка показана с причиной и расстоянием", async ({ page }) => {
    await stubDay(page, SUGGESTION);
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");

    await expect(page.getByText("Куда дальше")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Ресторан «Регистан»")).toBeVisible();

    // ПРИЧИНА ОБЯЗАТЕЛЬНА. Список без причин читается как распоряжение, а
    // решает человек — и по причине он решает, ехать или нет.
    await expect(page.getByText(/в объезде, точка №1/)).toBeVisible();
    await expect(page.getByText(/400 м/)).toBeVisible();
  });

  test("смена не начата — сказано словами, а не пустым местом", async ({ page }) => {
    await stubDay(page, {
      ...SUGGESTION,
      gate: "shift",
      gateText: "Смена не начата — начните смену, и подскажу, куда дальше.",
      next: [],
    });
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");

    await expect(page.getByText(/Смена не начата/)).toBeVisible({ timeout: 20_000 });
    // Ни одной подсказки при этом нет: запрет не украшение.
    await expect(page.locator('[id^="next-stop-"]')).toHaveCount(0);
  });

  test("не видно, где человек — тот же честный отказ", async ({ page }) => {
    await stubDay(page, {
      ...SUGGESTION,
      gate: "position",
      gateText: "Не вижу, где вы: включите запись дня — тогда подскажу ближайшие.",
      next: [],
    });
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");

    await expect(page.getByText(/Не вижу, где вы/)).toBeVisible({ timeout: 20_000 });
  });
});
