import { test, expect } from "./fixtures";
import { openMap } from "./adminNav";
import { stubAdmin } from "./mapStubs";
import { reportLayout, type Finding } from "./layoutAudit";
import type { Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// ОБХОД РАСКЛАДКИ: КАЖДЫЙ ЭКРАН КАРТЫ — НАСТОЯЩИМ БРАУЗЕРОМ.
//
// Владелец сказал: «чтобы ничего не наступало на ничего». Это проверяемо,
// и проверяет здесь браузер, а не глаз: чем меряем — см. layoutAudit.ts.
//
// ПОЧЕМУ ИМЕННО КАРТА. Это единственный экран админки, где слоёв больше
// двух: холст, плавающая обвязка поверх него, полоса дока поверх всего и
// лист над полосой. Остальные вкладки — колонка карточек, там наезжать
// нечему. Плюс ровно этим экраном пользуются с телефона на ходу, и
// прошлые снимки от владельца («нет кнопок назад», «пролистать карточку
// невозможно») приходили с него же.
//
// СНИМКИ ПРИКЛАДЫВАЮТСЯ ВСЕГДА, а не только при падении: находка вида
// «кнопку накрывает полоса» читается за секунду по картинке и за десять
// минут по списку узлов.
// ══════════════════════════════════════════════════════════════════════

/** Контролы MapLibre: нарисованы библиотекой, их размер задан не нами. */
const FOREIGN = [".maplibregl-ctrl", ".maplibregl-canvas-container"];

function fullscreenButton(page: Page) {
  return page.getByRole("button", { name: /На весь экран|Выйти из полного экрана/ });
}

/** Свести находки к одной строке — так падение читается без отчёта. */
function say(findings: Finding[]): string {
  return findings.map((f) => `[${f.kind}] ${f.what} — ${f.detail}`).join("\n");
}

/**
 * Обещанный прицел — только на телефоне и планшете.
 *
 * Правило в admin-shell.css живёт под `max-width: 1023px`, и живёт так
 * намеренно: «за 1024 px работают мышью, и растить там нечего — плотность
 * на большом экране полезна». Требовать 36 px на десктопе значило бы
 * проверять правило, которого нет, и получать сотню находок на ленте
 * фильтров, где всё в порядке.
 */
function targetFor(page: Page): number {
  return (page.viewportSize()?.width ?? 1280) < 1024 ? 36 : 0;
}

test.describe("Раскладка карты", () => {
  test("обычный режим: обвязка не накрывает саму карту", async ({ page }, info) => {
    await stubAdmin(page);
    await openMap(page);

    const found = await reportLayout(page, info, "map-normal", {
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });

  test("полный экран: полоса дока не накрывает плавающие кнопки", async ({ page }, info) => {
    await stubAdmin(page);
    await openMap(page);
    await fullscreenButton(page).click();
    await expect(page.locator(".admin-map-stage.is-full")).toBeVisible();

    // Смотрим на саму сцену: оболочка админки под ней перекрыта законно,
    // для того режим и включают. Область поиска при этом не сужается —
    // если плавающую кнопку накроет полоса дока, о ней сообщат, хотя сама
    // полоса лежит вне сцены.
    const found = await reportLayout(page, info, "map-full", {
      scope: ".admin-map-stage",
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });

  for (const tab of ["Фильтры", "Легенда", "Объезд", "Без пина"]) {
    test(`полный экран: вкладка «${tab}» помещается в лист`, async ({ page }, info) => {
      await stubAdmin(page);
      await openMap(page);
      await fullscreenButton(page).click();
      await page.locator(".admin-map-dock").getByRole("button", { name: tab }).click();
      await expect(page.locator(".admin-map-dock-sheet")).toBeVisible();

      // Открытый лист честно перекрывает карту под собой — это его работа,
      // а не дефект. Поэтому смотрим внутрь дока, а не на всю страницу.
      const found = await reportLayout(page, info, `dock-${tab}`, {
        scope: ".admin-map-dock",
        ignore: FOREIGN,
        minTarget: targetFor(page),
      });
      expect(say(found), say(found)).toBe("");
    });
  }

  test("полный экран: карточка точки достижима целиком", async ({ page }, info) => {
    await stubAdmin(page);
    await openMap(page);
    await fullscreenButton(page).click();

    await page.getByRole("button", { name: /Поиск|Qidiruv/ }).first().click();
    await page.getByPlaceholder(/Найти заведение|Joy topish/).first().fill("Плов");
    await page.getByText("Плов Центр").first().click();
    await expect(page.locator(".admin-map-dock-sheet")).toBeVisible();

    const found = await reportLayout(page, info, "dock-point", {
      scope: ".admin-map-dock",
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });

  test("панель точки вне полного экрана: ничего не наезжает", async ({ page }, info) => {
    // Это тот самый экран, снимок которого владелец прислал с телефона:
    // карточка заведения с навигатором, отметками визита, «Заезжать по
    // дням» и «Кто заезжает». Ниже 1024 px она приклеена к низу
    // (`.admin-map-panel`), то есть лежит поверх карты и рядом с
    // плавающими кнопками — самое тесное место в админке.
    await stubAdmin(page);
    await openMap(page);

    const search = page.getByPlaceholder(/Найти заведение|Joy topish/);
    if ((await search.count()) === 0) {
      await page.getByRole("button", { name: /Поиск|Qidiruv/ }).first().click();
    }
    await search.first().fill("Плов");
    await page.getByText("Плов Центр").first().click();

    const panel = page.locator(".admin-map-panel, .admin-map-aside").first();
    await expect(panel).toBeVisible();

    // Внутрь панели, а не по всей странице. Ниже 1024 px она приклеена к
    // низу на 70vh и НАМЕРЕННО накрывает собой ленты фильтров и панель
    // инструментов: «человек жал на точку и видел, что ничего не
    // произошло, — панель ждала его за экраном». Считать это перекрытием
    // значит спорить с решением, а не проверять его.
    const found = await reportLayout(page, info, "point-panel", {
      scope: ".admin-map-panel, .admin-map-aside",
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });

  test("обводка района: слой рисования не отдаёт нажатие обвязке", async ({ page }, info) => {
    await stubAdmin(page);
    await openMap(page);
    await page.getByRole("button", { name: "Обвести район" }).click();

    // Режим включён — подпись кнопки меняется на приглашение.
    await expect(page.getByRole("button", { name: "Обведите район" })).toBeVisible();

    const found = await reportLayout(page, info, "map-lasso", {
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });
});
