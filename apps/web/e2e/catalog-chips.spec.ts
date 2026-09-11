import { expect } from "@playwright/test";

import { test } from "./fixtures";

// ══════════════════════════════════════════════════════════════════════
// Разделы каталога: один ряд, линейки сразу за BALANS.
//
// ЗАЧЕМ СТОРОЖ. Этот ряд переделывали трижды, и каждый раз ломалось одно и
// то же — то, чего не видно. Сначала линеек не было вовсе: из шести в
// каталоге показывался только BALANS, потому что он рубрика, а остальные
// пять не назывались нигде. Потом они появились ВТОРЫМ рядом, и владелец
// увидел четыре чипа из шести: остальные уехали за правый край, а прокрутку
// замечают не все.
//
// Проверяется поэтому не подсчёт товаров, а РАСКЛАДКА: сколько разделов, в
// каком порядке и переносятся ли они строкой. Это единственное, что не
// зависит от содержимого базы и одинаково в CI и на проде.
// ══════════════════════════════════════════════════════════════════════

const EXPECTED = [
  "all",
  "microgreens",
  "baby-leaf",
  "salads",
  "balans",
  "KUNLIK",
  "OSHXONA",
  "CHEF",
  "BOLAJON",
  "sauces",
  "sets",
];

test.describe("Разделы каталога", () => {
  test("линейки стоят рядом с BALANS в одном ряду", async ({ page }) => {
    await page.goto("/catalog");

    const pills = page.locator('[id^="filter-"]');
    await expect(pills.first()).toBeVisible({ timeout: 20_000 });

    const ids = await pills.evaluateAll((nodes) =>
      nodes.map((n) => n.id.replace(/^filter-/, "")),
    );
    expect(ids).toEqual(EXPECTED);

    // Второго ряда нет: линейки живут здесь же, а не отдельным фильтром.
    await expect(page.locator('[id^="line-"]')).toHaveCount(0);
  });

  test("все разделы видны без прокрутки вбок", async ({ page }) => {
    await page.goto("/catalog");

    const last = page.locator("#filter-sets");
    await last.waitFor({ timeout: 20_000 });

    // Последний чип обязан помещаться в окно по горизонтали. Когда ряд
    // прокручивался, BOLAJON и CHEF стояли за краем — выбор, которого не
    // видно, не существует.
    const box = await last.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });

  test("имена разделов закрыты от автоперевода браузера", async ({ page }) => {
    await page.goto("/catalog");

    // Chrome на телефоне переводил KUNLIK в «ЕЖЕДНЕВНО», OSHXONA в «КУХНЯ»,
    // а «Бейби лист» — в «Список малышей». Имя переставало быть именем:
    // человек не узнавал на упаковке то, что прочитал на сайте.
    const names = page.locator(".category-pill__name");
    await expect(names.first()).toBeVisible({ timeout: 20_000 });
    const total = await names.count();
    const protectedCount = await page.locator('.category-pill__name[translate="no"]').count();
    expect(protectedCount).toBe(total);
  });
});
