import { test, expect } from "./fixtures";
import { openMap } from "./adminNav";
import type { Page } from "@playwright/test";

/**
 * Полноэкранный режим карты — настоящими компонентами.
 *
 * РАДИ ЧЕГО ЭТОТ СЦЕНАРИЙ
 *
 * Первая версия режима делала карту больше и при этом отнимала всё
 * остальное: легенда, объезд, районы и лоток оставались в боковой колонке
 * ПОД накрывшей их сценой. Проверить это раскладкой в отрыве от React
 * нельзя — вопрос ровно в том, что и когда рендерится.
 *
 * СЕТЬ ЗАГЛУШЕНА НАМЕРЕННО, той же причине, что в pos-from-map: сценарию
 * нужна разметка и склейка экранов, а не база. Стенда с прод-данными у
 * набора нет, и без заглушек сценарий не запускался бы нигде.
 *
 * ПОДЛОЖКА ЗАГЛУШЕНА СВОИМ СТИЛЕМ. Кнопка режима — родной контрол
 * MapLibre, то есть её вообще нет, пока карта не поднялась. А фикстура
 * набора обрывает всё, что уходит за пределы стенда, — значит и стиль с
 * tiles.openfreemap.org. Без заглушки холст падал в «Карта недоступна», и
 * контролов не появлялось вовсе.
 *
 * Стиль отдаём минимальный: одна заливка, ни одного источника. Этого
 * хватает, чтобы MapLibre создала карту и повесила контролы, и при этом
 * ни один байт не уходит наружу. Саму отрисовку слоёв здесь не проверяем —
 * на неё есть юнит-тесты выражений (mapLayers.test.ts).
 */

/** Минимальный валидный стиль: карта поднимается, сеть не нужна. */
const STUB_STYLE = {
  version: 8,
  name: "stub",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eeeeee" } }],
};

const POINTS = [
  { id: 1, n: "Плов Центр", st: "healthy", vt: "top", sp: 900000, lv: 2, gs: "manual" },
  { id: 2, n: "Registon Cafe", st: "at_risk", vt: "mid", sp: 200000, lv: 40, gs: "2gis" },
  { id: 3, n: "Чайхана Чорсу", st: "slipping", vt: "low", sp: 90000, lv: 9, gs: "seed" },
];

const COLLECTION = {
  type: "FeatureCollection",
  features: POINTS.map((p, i) => ({
    type: "Feature",
    id: p.id,
    geometry: { type: "Point", coordinates: [66.9597 + i * 0.004, 39.627 + i * 0.002] },
    properties: {
      n: p.n,
      t: "b2b",
      st: p.st,
      sp: p.sp,
      oc: 6,
      dl: 4,
      ov: 0.4,
      vt: p.vt,
      d: "samarkand-center",
      ct: "restaurant",
      au: null,
      gs: p.gs,
      ph: "+998901234567",
      ad: "ул. Регистан, 5",
      gp: "exact",
      lv: p.lv,
      k: "customer",
    },
  })),
  summary: {
    total: 5,
    placed: 3,
    unplaced: 2,
    byState: { prospect: 0, new: 0, healthy: 1, slipping: 1, at_risk: 1, lost: 0 },
    revenueByState: { prospect: 0, new: 0, healthy: 900000, slipping: 90000, at_risk: 200000, lost: 0 },
    spentPercentiles: { p50: 200000, p80: 900000 },
    districts: [
      { district: "samarkand-center", customers: 3, revenue: 1190000, atRisk: 1, prospects: 0, byCategory: { restaurant: 3 } },
    ],
    coverage: { exact: 3, rough: 0, missing: 2, total: 5, percent: 60 },
  },
  unplaced: [
    { id: 8, name: "Baraka Non", city: "Samarqand", address: "ул. Навои, 3", ordersCount: 2, totalSpent: 40000, lastOrderDate: null, state: "new", companyType: "bakery" },
    { id: 9, name: "Sam Ped Kolledj", city: "Samarqand", address: null, ordersCount: 0, totalSpent: 0, lastOrderDate: null, state: "lost", companyType: "canteen" },
  ],
};

async function stubAdmin(page: Page) {
  // Общая заглушка идёт ПЕРВОЙ: Playwright проверяет перехватчики от
  // позднего к раннему.
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/tiles.openfreemap.org/styles/**", (route) =>
    route.fulfill({ json: STUB_STYLE }),
  );
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/admin/customers/map/delivery**", (route) =>
    route.fulfill({ json: { routes: [] } }),
  );
  await page.route("**/api/admin/customers/map**", (route) => route.fulfill({ json: COLLECTION }));
}

/** Кнопка режима — родной контрол MapLibre, ищем по её подписи. */
function fullscreenButton(page: Page) {
  return page.getByRole("button", { name: /На весь экран|Выйти из полного экрана/ });
}

test.describe("Полноэкранный режим карты", () => {
  test("кнопка режима стоит в стопке контролов карты, а не в разметке страницы", async ({ page }) => {
    await stubAdmin(page);
    await openMap(page);

    const button = fullscreenButton(page);
    await expect(button).toHaveCount(1);
    // Родной контрол — значит внутри контейнера контролов MapLibre, рядом с
    // зумом. До этого кнопка висела в разметке сцены с отступом на глазок.
    await expect(button.locator("xpath=ancestor::div[contains(@class,'maplibregl-ctrl-top-right')]")).toHaveCount(1);
  });

  test("вход в режим: сцена растягивается, прокрутка фона гаснет", async ({ page }) => {
    await stubAdmin(page);
    await openMap(page);

    await expect(page.locator(".admin-map-stage.is-full")).toHaveCount(0);
    await expect(page.locator("html.map-fullscreen")).toHaveCount(0);

    await fullscreenButton(page).click();

    await expect(page.locator(".admin-map-stage.is-full")).toHaveCount(1);
    // Класс на корне гасит прокрутку .admin-main: в админке скроллит она,
    // а не body.
    await expect(page.locator("html.map-fullscreen")).toHaveCount(1);

    // ── ПРИЧИНА, А НЕ СЛЕДСТВИЕ ────────────────────────────────────────
    //
    // Классы выше стояли и в тот день, когда владелец прислал снимок
    // «полного экрана» размером в треть экрана. Полный экран сделан через
    // `position: fixed`, а он отсчитывается не от экрана, если у любого
    // предка есть transform/filter/perspective.
    //
    // Именно это и случилось: `main, [data-page]` получает `animation:
    // page-enter … both`, и fill-mode навсегда оставляет на каждом <main>
    // ЕДИНИЧНЫЙ `transform: matrix(1,0,0,1,0,0)` — ничего не двигающий и
    // оттого невидимый глазом. Сцена начиналась под шапкой, на её высоту
    // свисала за нижний край, полоса дока вставала посреди экрана.
    //
    // Проверяем отсутствие таких предков, а не совпадение прямоугольника:
    // прямоугольник совпадает и случайно — когда предок-«якорь» сам занял
    // весь экран. Инвариант же нарушить незаметно нельзя.
    const anchors = await page.evaluate(() => {
      const stage = document.querySelector(".admin-map-stage");
      const bad: string[] = [];
      let el = stage?.parentElement ?? null;
      while (el && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        if (cs.transform !== "none" || cs.filter !== "none" || cs.perspective !== "none") {
          bad.push(`${el.tagName.toLowerCase()}.${el.className} → ${cs.transform}`);
        }
        el = el.parentElement;
      }
      return bad;
    });
    expect(anchors).toEqual([]);

    const viewport = page.viewportSize();
    if (viewport) {
      const box = await page.locator(".admin-map-stage.is-full").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBe(0);
      expect(box!.y).toBe(0);
      expect(Math.round(box!.width)).toBe(viewport.width);
      // Допуск в пиксель: dvh на дробном масштабе округляется.
      expect(Math.abs(box!.height - viewport.height)).toBeLessThanOrEqual(1);
    }
  });

  test("панели в режиме доступны — ради этого док и появился", async ({ page }) => {
    await stubAdmin(page);
    await openMap(page);
    await fullscreenButton(page).click();

    const dock = page.locator(".admin-map-dock");
    await expect(dock).toBeVisible();

    // Лоток знает, сколько клиентов без координат: счётчик на кнопке — это
    // то, ради чего её видно.
    await expect(dock.getByRole("button", { name: /Без пина/ })).toContainText("2");

    // Объезд, легенда и фильтры открываются и закрываются той же кнопкой.
    for (const name of [/Легенда/, /Объезд/, /Фильтры/]) {
      await dock.getByRole("button", { name }).click();
      await expect(page.locator(".admin-map-dock-sheet")).toBeVisible();
      await dock.getByRole("button", { name }).click();
      await expect(page.locator(".admin-map-dock-sheet")).toHaveCount(0);
    }
  });

  test("Escape закрывает вкладку дока, а не сам режим", async ({ page }) => {
    await stubAdmin(page);
    await openMap(page);
    await fullscreenButton(page).click();

    await page.locator(".admin-map-dock").getByRole("button", { name: /Легенда/ }).click();
    await expect(page.locator(".admin-map-dock-sheet")).toBeVisible();

    // Первый Escape — вкладка. Режим обязан устоять: иначе одно нажатие
    // закрывало бы сразу две вещи.
    await page.keyboard.press("Escape");
    await expect(page.locator(".admin-map-dock-sheet")).toHaveCount(0);
    await expect(page.locator(".admin-map-stage.is-full")).toHaveCount(1);

    // Второй — сам режим.
    await page.keyboard.press("Escape");
    await expect(page.locator(".admin-map-stage.is-full")).toHaveCount(0);
    await expect(page.locator("html.map-fullscreen")).toHaveCount(0);
  });

  test("выход из режима уносит вкладку дока с собой", async ({ page }) => {
    await stubAdmin(page);
    await openMap(page);
    await fullscreenButton(page).click();

    await page.locator(".admin-map-dock").getByRole("button", { name: /Объезд/ }).click();
    await expect(page.locator(".admin-map-dock-sheet")).toBeVisible();

    await fullscreenButton(page).click();
    await expect(page.locator(".admin-map-dock")).toHaveCount(0);

    // Вернулись — лист не всплыл сам собой поверх карты.
    await fullscreenButton(page).click();
    await expect(page.locator(".admin-map-dock")).toBeVisible();
    await expect(page.locator(".admin-map-dock-sheet")).toHaveCount(0);
  });

  test("карточка точки: один заголовок и достижимые действия", async ({ page }) => {
    // ── ЧТО СЛОМАЛОСЬ НА БОЮ ───────────────────────────────────────────
    //
    // Владелец прислал снимок с телефона: в листе дока имя заведения
    // напечатано ДВАЖДЫ подряд, каждое со своим крестиком, рамка внутри
    // рамки, а «Продать» и «В объезд» недостижимы — «пролистать карточку
    // невозможно».
    //
    // Две причины. Первая: лист рисует свой заголовок, а карточка внутри —
    // свой. Вторая, и она тише: тело листа — flex-ребёнок колонки, а у
    // flex-элемента min-height по умолчанию auto, то есть он отказывается
    // сжиматься ниже содержимого и `overflow-y: auto` не включается
    // никогда. Низ карточки просто уезжал за нижний край экрана.
    await stubAdmin(page);
    await openMap(page);
    await fullscreenButton(page).click();

    // Поиск в полном экране СВЁРНУТ: развёрнутым он занимал верхнюю треть
    // карты, ради которой режим и включают. Проверяем и это — иначе
    // следующая правка вернёт карточку на 360 px незамеченной.
    await expect(page.getByPlaceholder(/Найти заведение|Joy topish/)).toHaveCount(0);
    await page.getByRole("button", { name: /Поиск|Qidiruv/ }).first().click();

    // Точку выбираем поиском: тот же путь к карточке, что у человека, и
    // он не требует попадания пальцем по холсту.
    await page.getByPlaceholder(/Найти заведение|Joy topish/).first().fill("Плов");
    await page.getByText("Плов Центр").last().click();
    await expect(page.locator(".admin-map-dock-sheet")).toBeVisible();

    // Имя — ровно один раз. Дубль ловим счётом, а не глазами.
    const titles = await page
      .locator(".admin-map-dock-sheet")
      .getByText("Плов Центр", { exact: true })
      .count();
    expect(titles).toBe(1);

    // Тело листа обязано УМЕТЬ прокручиваться: иначе всё, что ниже,
    // недостижимо в принципе — ни пальцем, ни жестом.
    const scrollable = await page.evaluate(() => {
      const body = document.querySelector(".admin-map-dock-sheet-body");
      if (!body) return null;
      const style = getComputedStyle(body);
      return { minHeight: style.minHeight, overflowY: style.overflowY };
    });
    expect(scrollable).not.toBeNull();
    expect(scrollable!.overflowY).toBe("auto");
    // `auto` здесь и есть поломка: она запрещает flex-элементу сжиматься.
    expect(scrollable!.minHeight).not.toBe("auto");

    // И главное — ради чего карточку вообще открывают.
    const sheet = page.locator(".admin-map-dock-sheet");
    await expect(sheet.getByRole("button", { name: /Продать|Sotish/ })).toHaveCount(1);
    await expect(sheet.getByRole("button", { name: /объезд|Yoʻnalish/i })).not.toHaveCount(0);

    // ── КАССА С ТОЧКИ ──────────────────────────────────────────────────
    //
    // «Продать» заменяет карточку кассовым листом, а у него внутри две
    // свои прокручиваемые области — список товаров и корзина, по 38 и
    // 30 процентов высоты экрана. В листе высотой 62dvh они не
    // помещаются, и чек набирается в щель: две строки товара и никакого
    // итога. Поэтому лист обязан подрасти, когда касса внутри.
    await sheet.getByRole("button", { name: /Продать|Sotish/ }).click();
    await expect(page.locator(".pos-sale-sheet")).toBeVisible();

    const grown = await page.evaluate(() => {
      const el = document.querySelector(".admin-map-dock-sheet");
      if (!el) return null;
      return {
        высота: Math.round(el.getBoundingClientRect().height),
        экран: window.innerHeight,
      };
    });
    expect(grown).not.toBeNull();
    // Больше прежнего потолка в 62% — значит правило `:has()` сработало.
    expect(grown!.высота).toBeGreaterThan(grown!.экран * 0.62);
  });
});
