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
// Проверяется поэтому РАСКЛАДКА: сколько разделов, в каком порядке и
// переносятся ли они строкой.
//
// И отдельно — что фильтр работает. Раньше содержимое здесь проверить было
// нельзя: CI засевал старый каталог из `seed.ts`, где линеек нет вовсе, и
// нажатие на KUNLIK честно давало ноль товаров. Теперь набор гоняет ту же
// цепь засева, что и деплой (`seed-if-empty.ts` → `import-catalog.ts`),
// поэтому каталог в CI и на проде — один и тот же.
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

  test("все плитки разделов одного размера", async ({ page }) => {
    await page.goto("/catalog");

    const pills = page.locator(".category-pill");
    await expect(pills.first()).toBeVisible({ timeout: 20_000 });

    // Ширину задавала длина слова, а высоту — наличие значка: у четырёх
    // линеек его не было, и плитка выходила ниже соседей. Ряд читался как
    // случайный набор кнопок. Размер теперь задаёт сетка, а значок
    // обязателен по типу — здесь проверяется результат обоих решений.
    const sizes = await pills.evaluateAll((nodes) =>
      nodes.map((n) => {
        const b = n.getBoundingClientRect();
        return `${Math.round(b.width)}x${Math.round(b.height)}`;
      }),
    );
    expect(sizes.length).toBe(EXPECTED.length);
    expect([...new Set(sizes)]).toHaveLength(1);
    expect(await page.locator(".category-pill__icon").count()).toBe(EXPECTED.length);
  });

  test("нажатие на линейку сужает каталог, а не опустошает его", async ({ page }) => {
    await page.goto("/catalog");

    // Считаем КАРТОЧКИ, а не строку «показано N из M»: она двуязычная, и
    // разбор её текста ломался бы от переключения языка, а не от поломки
    // фильтра.
    const cards = page.locator('a[href^="/product/"]');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    const all = await cards.count();
    expect(all).toBeGreaterThan(0);

    // ЖДЁМ ОТВЕТ ДВЕРИ, а не просто «стало меньше карточек». Между нажатием и
    // новым списком экран на мгновение пуст, и проверка «меньше, чем было»
    // проходила на этой пустоте — то есть проходила бы и на сломанном
    // фильтре, который не возвращает ничего.
    const narrowed = page.waitForResponse(
      (r) => r.url().includes("line=BOLAJON") && r.ok(),
    );
    await page.locator("#filter-BOLAJON").click();
    await narrowed;

    // Детская линейка — самая узкая: горох, подсолнечник и шпинат. Точное
    // число не проверяем, оно меняется вместе с ассортиментом; проверяем
    // смысл фильтра — товары есть, и их меньше, чем всего.
    await expect.poll(() => cards.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(await cards.count()).toBeLessThan(all);

    // Рубрика при этом снялась: два фильтра вместе дали бы пересечение и
    // пустой экран, который читается как сломанный каталог.
    await expect(page.locator("#filter-all")).not.toHaveClass(/active/);
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
