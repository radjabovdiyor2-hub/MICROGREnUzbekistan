import { test, expect } from "./fixtures";
import { loginAsSeller, loginAsOwner, openAdminTab } from "./adminNav";
import { reportLayout, type Finding } from "./layoutAudit";
import type { Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// ОБХОД РАСКЛАДКИ: ПОЛЕВЫЕ ЭКРАНЫ.
//
// Карту проверяет соседний файл. Здесь — то, что продавец держит перед
// глазами весь день: рейс с подсказкой «куда дальше» и свой день. И то же
// самое глазами владельца: «День в поле».
//
// ПОЧЕМУ ЭТИ ТРИ. На них плотнее всего органов управления на единицу
// ширины: строка остановки несёт адрес, телефон, номер заказа и три
// действия, а подсказка сверху — ещё кнопку. Именно такие ряды первыми
// начинают наезжать друг на друга, когда текст оказывается длиннее
// ожидаемого, — а адреса в Самарканде длинные.
// ══════════════════════════════════════════════════════════════════════

const FOREIGN = [".maplibregl-ctrl", ".maplibregl-canvas-container"];

function say(findings: Finding[]): string {
  return findings.map((f) => `[${f.kind}] ${f.what} — ${f.detail}`).join("\n");
}

/** 36 px обещаны только ниже 1024 px — см. правило в admin-shell.css. */
function targetFor(page: Page): number {
  return (page.viewportSize()?.width ?? 1280) < 1024 ? 36 : 0;
}

/**
 * Данные нарочно «неудобные»: длинное название, длинный адрес, длинный
 * номер. Раскладка ломается не на образцовой строке, а на настоящей.
 */
const SUGGESTION = {
  status: "ok",
  has: true,
  gate: null,
  gateText: null,
  freshAfterMin: 30,
  text: "Следующая точка — по объезду.",
  next: [
    {
      point: {
        id: 5,
        name: "Свадебный ресторан «Регистан Плаза Люкс»",
        latitude: 39.65,
        longitude: 66.96,
      },
      kind: "plan",
      km: 0.4,
      kmLabel: "400 м",
      reason: "в объезде, точка №1",
      orderIndex: 0,
    },
  ],
};

const ROUTE = [
  {
    id: "r1",
    date: "2026-09-13T04:00:00.000Z",
    status: "pending",
    stops: [
      {
        id: "s1",
        address: "Самарканд, Сиабский район, ул. Регистан, дом 1, подъезд 2",
        phone: "+998900000001",
        status: "pending",
        latitude: 39.65,
        longitude: 66.96,
        order: { orderNumber: "1042" },
      },
      {
        id: "s2",
        address: "Самарканд, ул. Амира Темура, 145А",
        phone: "+998900000002",
        status: "pending",
        latitude: 39.66,
        longitude: 66.97,
        order: { orderNumber: "1043" },
      },
    ],
  },
];

const DAY = {
  status: "ok",
  day: {
    id: 1,
    startedAt: "2026-09-12T04:00:00.000Z",
    endedAt: "2026-09-12T12:30:00.000Z",
    source: "app",
    meters: 12400,
    movingSec: 3600,
    stops: 3,
    employee: { id: "emp-1", name: "Азиз" },
  },
  shift: {
    startTime: "2026-09-12T04:00:00.000Z",
    endTime: null,
    openedVia: "pwa",
    closedAuto: false,
  },
  track: [],
  stays: [],
  legs: [],
  idle: [],
  gaps: 0,
  idleAfterMin: 30,
};

async function stubField(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/inventory/employees**", (route) =>
    route.fulfill({ json: { employees: [{ id: "emp-1", name: "Азиз" }] } }),
  );
  await page.route("**/api/admin/staff/day**", (route) => route.fulfill({ json: SUGGESTION }));
  await page.route("**/api/admin/deliveries**", (route) => route.fulfill({ json: ROUTE }));
  await page.route("**/api/admin/tracking/day**", (route) => route.fulfill({ json: DAY }));
}

test.describe("Раскладка полевых экранов", () => {
  test("продавец: «Мой рейс» с подсказкой и двумя остановками", async ({ page }, info) => {
    await stubField(page);
    await loginAsSeller(page);
    await openAdminTab(page, "Мой рейс");
    await expect(page.getByText(/Регистан/).first()).toBeVisible({ timeout: 20_000 });

    const found = await reportLayout(page, info, "my-route", {
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });

  test("продавец: «Мой день»", async ({ page }, info) => {
    await stubField(page);
    await loginAsSeller(page);
    await openAdminTab(page, "Мой день");
    await expect(page.getByText(/Пройдено/).first()).toBeVisible({ timeout: 20_000 });

    const found = await reportLayout(page, info, "my-day", {
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });

  test("владелец: «День в поле»", async ({ page }, info) => {
    await stubField(page);
    await loginAsOwner(page);
    await openAdminTab(page, "День в поле");
    // Владельцу день сначала надо выбрать: он смотрит чужую работу, и
    // экран не знает, чью именно, пока не назовут человека.
    await page.locator("select").first().selectOption("emp-1");
    await expect(page.getByText(/Пройдено/).first()).toBeVisible({ timeout: 20_000 });

    const found = await reportLayout(page, info, "field-day", {
      ignore: FOREIGN,
      minTarget: targetFor(page),
    });
    expect(say(found), say(found)).toBe("");
  });
});
