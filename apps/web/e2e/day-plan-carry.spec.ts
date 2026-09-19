import { test, expect } from "./fixtures";
import { loginAsSeller, openAdminTab } from "./adminNav";
import { COLLECTION, STUB_STYLE } from "./mapStubs";
import type { Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// «СОБРАТЬ НА СЕГОДНЯ»: ВЧЕРАШНИЙ ХВОСТ И РАСПИСАНИЕ.
//
// ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ СКВОЗНЫМ СЦЕНАРИЕМ
//
// Обе части существовали в коде и ни одна не доходила до экрана.
//
// Перенос (`readCarryOver`, `mergeStops`) был написан, покрыт юнит-тестами
// и НЕ ПОДКЛЮЧЁН НИ К ЧЕМУ: точка, до которой вчера не доехали, никуда не
// переносилась. Расписание («заезжать по вторникам») читали экран
// назначения и финансовый прогноз, а автоплан — нет.
//
// Юнит-тесты обеих частей проходили и тогда. Ломалась именно проводка:
// дверь → кнопка → список объезда. Видно её только в браузере.
//
// ДАННЫЕ ПОДОБРАНЫ ТАК, ЧТОБЫ ОТВЕТ БЫЛ ОДНОЗНАЧНЫМ. У «Плов Центра»
// последний визит два дня назад — обычная пауза в три дня его из плана
// ВЫБРАСЫВАЕТ. Он же стоит в расписании на сегодня. Если он в списке,
// значит расписание действительно сильнее паузы, а не просто «как-то
// работает».
// ══════════════════════════════════════════════════════════════════════

/**
 * Вчера не доехали до «Чайханы Чорсу».
 *
 * ИМЕННО ДО НЕЁ, А НЕ ДО ЛЮБОЙ. «Чайхана» замедлилась, а «Registon Cafe»
 * под угрозой — по обычному весу второй идёт впереди первой. Возьми мы в
 * хвост «Registon», проверка «перенесённый первым» проходила бы сама
 * собой, ничего при этом не проверяя: он оказался бы первым и без всякого
 * переноса. Хвостом взята та точка, которая сама вперёд не выйдет.
 */
const CARRY = [
  {
    customerId: 3,
    carriedTimes: 1,
    interactionId: null,
    name: "Чайхана Чорсу",
    latitude: 39.631,
    longitude: 66.9677,
  },
];

async function stub(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/tiles.openfreemap.org/styles/**", (route) =>
    route.fulfill({ json: STUB_STYLE }),
  );
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/admin/customers/map/delivery**", (route) =>
    route.fulfill({ json: { routes: [] } }),
  );
  await page.route("**/api/admin/customers/map**", (route) => route.fulfill({ json: COLLECTION }));

  // День: назначения сверху нет, вчерашний хвост есть.
  await page.route("**/api/admin/visit-plans**", (route) =>
    route.fulfill({
      json: { status: "ok", plans: [], carry: CARRY, carryExhausted: [] },
    }),
  );

  // Расписание: сегодня ждут «Плов Центр», и ждут кого угодно
  // (`assignee: ''`) — то есть строка годится и продавцу.
  await page.route("**/api/admin/visit-schedules**", (route) =>
    route.fulfill({ json: { weekday: 1, items: [{ customerId: 1, assignee: "" }] } }),
  );
}

/** Продавец на карте: вкладка «Клиенты» → вид «Карта». */
async function openSellerMap(page: Page) {
  await loginAsSeller(page);
  await openAdminTab(page, "Клиенты");
  await page.getByRole("button", { name: "Карта" }).first().click();
  await expect(page.locator(".admin-map-stage")).toBeVisible();
}

test.describe("План на сегодня", () => {
  test("вчерашний хвост идёт первым, а расписание сильнее паузы", async ({ page }) => {
    await stub(page);
    await openSellerMap(page);

    await page.getByRole("button", { name: /Собрать на сегодня/ }).click();

    // Список объезда появляется под кнопкой.
    const stops = page.locator("li").filter({ hasText: /Плов Центр|Registon Cafe|Чайхана/ });
    await expect(stops.first()).toBeVisible({ timeout: 15_000 });

    const names = await stops.allInnerTexts();

    // ПЕРВЫМ — вчерашний. Точка, ждущая второй день, не должна проигрывать
    // очередь свежей: иначе она не выиграет её никогда.
    expect(names[0]).toContain("Чайхана");

    // «Плов Центр» здесь ТОЛЬКО благодаря расписанию: пауза после заезда
    // два дня назад выкинула бы его из любого обычного плана.
    expect(names.join(" | ")).toContain("Плов Центр");
  });

  test("без расписания и хвоста план собирается как раньше", async ({ page }) => {
    await stub(page);
    // Тот же экран, но день пустой: ни переносов, ни назначенных дней.
    await page.route("**/api/admin/visit-plans**", (route) =>
      route.fulfill({ json: { status: "ok", plans: [], carry: [], carryExhausted: [] } }),
    );
    await page.route("**/api/admin/visit-schedules**", (route) =>
      route.fulfill({ json: { weekday: 1, items: [] } }),
    );

    await openSellerMap(page);
    await page.getByRole("button", { name: /Собрать на сегодня/ }).click();

    const stops = page.locator("li").filter({ hasText: /Плов Центр|Registon Cafe|Чайхана/ });
    await expect(stops.first()).toBeVisible({ timeout: 15_000 });

    const names = (await stops.allInnerTexts()).join(" | ");

    // Пауза снова работает: «Плов Центр» был два дня назад и в план не идёт.
    expect(names).not.toContain("Плов Центр");

    // И порядок снова обычный — по весу. «Registon Cafe» под угрозой,
    // «Чайхана» только замедлилась, поэтому без переноса первым идёт
    // первый. Ровно это и делает предыдущую проверку содержательной.
    expect(names.split(" | ")[0]).toContain("Registon Cafe");
  });
});
