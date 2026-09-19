import { test, expect } from "./fixtures";
import { loginAsOwner, openAdminTab } from "./adminNav";
import { reportLayout, type Finding } from "./layoutAudit";
import type { Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// ОБХОД РАСКЛАДКИ: ОБОЛОЧКА АДМИНКИ.
//
// Карту и поле проверяют соседние файлы. Здесь — то, что общее для всех
// сорока вкладок: выдвижное меню на телефоне.
//
// ПОЧЕМУ МЕНЮ, А НЕ ВКЛАДКИ ПО ОЧЕРЕДИ. Меню — единственный элемент,
// который открывается ПОВЕРХ произвольного экрана. У каждой вкладки свои
// приклеенные полосы, и если хоть одна написана с тем же номером слоя,
// что и ящик, порядок решит не замысел, а порядок узлов в разметке:
// ящик объявлен раньше содержимого вкладки, поэтому проигрывает молча.
//
// Касса взята как худший случай: у неё внизу плавающая кнопка чека во всю
// ширину, и появляется она только когда в корзине что-то есть — то есть
// ровно в середине работы, а не на пустом экране, который обычно и
// смотрят.
// ══════════════════════════════════════════════════════════════════════

const PRODUCTS = {
  items: [
    {
      id: "p-gorokh",
      nameUz: "Mikrozelen Gorox",
      nameRu: "Микрозелень Горох",
      price: 25000,
      unit: "лоток",
      costPrice: 9000,
      stock: 12,
      images: [],
      category: { nameUz: "Mikrozelen" },
    },
  ],
};

function say(findings: Finding[]): string {
  return findings.map((f) => `[${f.kind}] ${f.what} — ${f.detail}`).join("\n");
}

async function stub(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/products**", (route) => route.fulfill({ json: PRODUCTS }));
}

test.describe("Раскладка оболочки", () => {
  test("меню открывается ПОВЕРХ набранного чека, а не под ним", async ({ page }, info) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, "ящика нет: колонка стоит всегда");

    await stub(page);
    await loginAsOwner(page);
    await openAdminTab(page, "Продажи (касса)");

    // Кладём товар в чек — плавающая кнопка появляется только с ним.
    await page.getByText("Mikrozelen Gorox").first().click();
    await expect(page.getByRole("button", { name: /Чек|Cheк/ }).first()).toBeVisible();

    await page.locator(".mobile-menu-btn").click();
    await expect
      .poll(async () => (await page.locator(".admin-sidebar").boundingBox())?.x ?? -1)
      .toBeGreaterThanOrEqual(0);

    // Смотрим внутрь ящика: всё, что под ним, перекрыто законно — он для
    // того и открыт. Вопрос ровно один: доберётся ли нажатие до вкладок.
    const found = await reportLayout(page, info, "drawer-over-pos", {
      scope: ".admin-sidebar",
    });
    expect(say(found), say(found)).toBe("");
  });
});
