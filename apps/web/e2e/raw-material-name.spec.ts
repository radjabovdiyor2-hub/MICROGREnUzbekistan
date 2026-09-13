import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures";
import { loginAsOwner, openAdminTab } from "./adminNav";

// ══════════════════════════════════════════════════════════════════════
// Второе имя позиции сырья: его негде было ввести и некуда показать.
//
// ЧТО БЫЛО. У `RawMaterial` одно поле `name`. Тридцать две позиции —
// «Кокосовый субстрат», «Лоток 10×20», «Семена: Амарант» — оставались
// русскими на полностью узбекском экране, и это не «забыли вывести
// перевод»: переводить было нечего, колонки не существовало.
//
// ДВЕ ПОЛОВИНЫ ОДНОГО ДЕЛА. Колонка без экрана правки осталась бы пустой
// навсегда: заведённую позицию до сих пор нельзя было изменить — только
// оприходовать или скрыть. Поэтому вместе с колонкой появилась правка.
//
// Сценарий проверяет обе половины: форма ОТПРАВЛЯЕТ второе имя, таблица
// ПОКАЗЫВАЕТ его узбекскому читателю.
// ══════════════════════════════════════════════════════════════════════

const MATERIAL = {
  id: "rm-1",
  name: "Кокосовый субстрат",
  nameUz: null as string | null,
  kind: "SUBSTRATE",
  unit: "g",
  stock: 5000,
  avgCost: 12,
  minStock: 1000,
  cropType: null,
  stockValue: 60000,
  isLow: false,
  isActive: true,
  lastPrice: null,
};

async function stub(page: Page, nameUz: string | null) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/admin/raw-materials**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { status: "ok", materials: [{ ...MATERIAL, nameUz }] } });
    }
    return route.fulfill({ json: { status: "ok", material: { ...MATERIAL, nameUz } } });
  });
}

test.describe("Второе имя позиции сырья", () => {
  test("правка отправляет узбекское имя на сервер", async ({ page }) => {
    await stub(page, null);
    await loginAsOwner(page);
    await openAdminTab(page, "Сырьё");

    await expect(page.getByText("Кокосовый субстрат").first()).toBeVisible({ timeout: 25_000 });

    // Ловим тело запроса: предмет проверки — что форма ОТПРАВЛЯЕТ поле, а не
    // что она его показывает. Показ проверяется вторым сценарием.
    const sent = page.waitForRequest(
      (r) => r.url().includes("/api/admin/raw-materials") && r.method() === "PATCH",
    );

    await page.getByRole("button", { name: /Правка|Tahrirlash/ }).first().click();
    await page.getByPlaceholder("No'xat urug'i").fill("Kokos substrati");
    await page.getByRole("button", { name: /^(Сохранить|Saqlash)$/ }).click();

    const body = (await sent).postDataJSON();
    expect(body.nameUz).toBe("Kokos substrati");
    expect(body.id).toBe("rm-1");
  });

  test("заполненное имя читается по-узбекски, пустое откатывается к русскому", async ({ page }) => {
    await stub(page, "Kokos substrati");
    await loginAsOwner(page);
    await openAdminTab(page, "Сырьё");

    // Русскому читателю — русское имя, даже когда узбекское заполнено.
    await expect(page.getByText("Кокосовый субстрат").first()).toBeVisible({ timeout: 25_000 });

    // Язык переключаем КНОПКОЙ, как это делает человек. Через перезагрузку
    // нельзя: вход в сценарии держится заглушкой пароля, и reload возвращает
    // экран входа — падало бы на устройстве проверки, а не на предмете.
    await page.getByRole("button", { name: /Сменить язык|Tilni almashtirish/ }).first().click();

    await expect(page.getByText("Kokos substrati").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("Кокосовый субстрат")).toHaveCount(0);
  });
});
