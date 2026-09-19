import { test, expect } from "./fixtures";
import { loginAsOwner, openAdminTab } from "./adminNav";
import { reportLayout, type Finding } from "./layoutAudit";
import type { Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// ОБХОД РАСКЛАДКИ: ОСТАЛЬНЫЕ ВКЛАДКИ ВЛАДЕЛЬЦА.
//
// Карта, поле и оболочка проверяются соседними файлами — там слои и там
// же водились настоящие дефекты. Здесь широкий, но мелкий проход: по
// одному снимку с каждой рабочей вкладки.
//
// ЧТО ОН ЛОВИТ И ЧЕГО НЕ ЛОВИТ. Двери заглушены пустыми ответами, значит
// на экранах пустые состояния. Наложений содержимого тут не увидишь — их
// видно только на настоящих данных. Зато видно то, что от данных не
// зависит и ломается чаще: вылет за правый край, обрезанная подпись,
// прицел меньше пальца, полоса поверх кнопки.
//
// ПОЧЕМУ ВСЁ РАВНО СТОИТ ДЕРЖАТЬ. Пустой экран — это тот самый экран,
// который человек видит ПЕРВЫМ, до того как появятся данные. Если на нём
// что-то наезжает, впечатление уже испорчено.
// ══════════════════════════════════════════════════════════════════════

const TABS = [
  "Объезды за день",
  "Клиенты",
  "Заказы",
  "Сотрудники",
  "График смен",
  "Задачи отделам",
  "Долги",
  "Склад",
  "Товары",
  "Аналитика",
  "Сводка",
  "Расходы",
  "Настройки",
];

function say(findings: Finding[]): string {
  return findings.map((f) => `[${f.kind}] ${f.what} — ${f.detail}`).join("\n");
}

function targetFor(page: Page): number {
  return (page.viewportSize()?.width ?? 1280) < 1024 ? 36 : 0;
}

async function stub(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
}

test.describe("Раскладка вкладок", () => {
  for (const tab of TABS) {
    test(`«${tab}» ничем себя не накрывает`, async ({ page }, info) => {
      await stub(page);
      await loginAsOwner(page);
      await openAdminTab(page, tab);

      // Ждём, пока экран перестанет быть заглушкой загрузки: измерять
      // скелет бессмысленно, он живёт доли секунды и ничего не значит.
      await expect(page.locator(".admin-main")).toBeVisible();
      await page.waitForTimeout(700);

      const found = await reportLayout(page, info, `tab-${tab}`, {
        scope: ".admin-main",
        minTarget: targetFor(page),
      });
      expect(say(found), say(found)).toBe("");
    });
  }
});
