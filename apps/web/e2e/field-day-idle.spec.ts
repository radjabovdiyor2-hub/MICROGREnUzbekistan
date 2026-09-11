import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures";
import { loginAsOwner, openAdminTab } from "./adminNav";

// ══════════════════════════════════════════════════════════════════════
// Простой и разрыв связи в отчёте дня — глазами владельца.
//
// ЗАЧЕМ СКВОЗНЫМ СЦЕНАРИЕМ. Арифметику простоя проверяют юнит-тесты
// (`lib/tracking/idle.test.ts`), и она верна независимо от экрана. Тихо
// ломается другое: число посчитано, отдано дверью — и не доехало до
// разметки. Так уже было с `gaps`: он вычислялся в `summarize` с самого
// начала и выбрасывался, а владелец видел ровный день там, где связи не
// было час. Ни один юнит-тест этого не видит.
//
// ЧТО ЗДЕСЬ ЗАГЛУШЕНО И ПОЧЕМУ. День приходит выдуманный: в наборе нет ни
// базы, ни трека, а проверяется не подсчёт, а проводка от ответа двери до
// строки на экране. Трек пустой намеренно — карта требует WebGL и к этому
// вопросу отношения не имеет.
// ══════════════════════════════════════════════════════════════════════

const EMPLOYEE = { id: "emp-1", name: "Азиз" };

/** Ответ `/api/admin/tracking/day`: заезд, простой и два разрыва связи. */
const DAY = {
  status: "ok",
  day: {
    id: 1,
    // Телефон прислал первую точку ночью — ровно так выглядел день
    // Davlat: «смена 00:26–11:06», хотя смену он открыл утром.
    startedAt: "2026-09-11T00:26:00.000Z",
    endedAt: "2026-09-11T17:30:00.000Z",
    source: "telegram_live",
    meters: 12400,
    movingSec: 3600,
    stops: 1,
    employee: EMPLOYEE,
  },
  // Смена и окно записи НАМЕРЕННО РАЗНЫЕ: человек открыл смену в 09:00, а
  // телефон прислал первую точку ещё ночью. Раньше экран показывал одно
  // вместо другого и утверждал «смена 00:26–11:06» — отличить работавшего
  // человека от проснувшегося телефона было нельзя.
  shift: {
    startTime: '2026-09-11T09:00:00.000Z',
    endTime: '2026-09-11T18:00:00.000Z',
    openedVia: 'pwa',
    closedAuto: false,
  },
  track: [],
  stays: [
    {
      id: 10,
      arrivedAt: "2026-09-11T11:00:00.000Z",
      leftAt: "2026-09-11T14:00:00.000Z",
      // Три часа у одного клиента: столько бывает и законно, поэтому
      // пометка серая и осторожная — «долго», а не «нарушение».
      dwellSec: 3 * 60 * 60,
      confirmedBy: "manual",
      customer: {
        id: 5,
        name: null,
        companyName: "Ресторан «Регистан»",
        latitude: 39.65,
        longitude: 66.96,
      },
      interaction: null,
      photos: [],
    },
  ],
  legs: [],
  idle: [
    {
      startedAt: "2026-09-11T15:00:00.000Z",
      endedAt: "2026-09-11T15:42:00.000Z",
      idleSec: 42 * 60,
      latitude: 39.66,
      longitude: 66.97,
      pings: 40,
    },
  ],
  gaps: 2,
  idleAfterMin: 30,
};

async function stubDay(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/inventory/employees**", (route) =>
    route.fulfill({ json: { employees: [EMPLOYEE] } }),
  );
  await page.route("**/api/admin/tracking/day**", (route) => route.fulfill({ json: DAY }));
}

test.describe("День в поле: простой и связь", () => {
  test("владелец видит простой и разрывы, а не только четыре числа", async ({ page }) => {
    await stubDay(page);
    await loginAsOwner(page);
    await openAdminTab(page, "День в поле");

    await page.locator("select").first().selectOption(EMPLOYEE.id);

    // ДВА РАЗНЫХ СОСТОЯНИЯ, ДВЕ РАЗНЫЕ СТРОКИ. «Стоял» — вопрос к
    // человеку, «связь пропадала» — чаще к телефону; одно слово на оба
    // случая заставило бы спросить не о том.
    await expect(page.getByText(/Простоев/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/42 мин/).first()).toBeVisible();
    await expect(page.getByText(/Связь пропадала/)).toBeVisible();

    // Простой стоит В ЛЕНТЕ и назван словами, а не только числом сверху.
    await expect(page.getByText(/стоял/)).toBeVisible();
    await expect(page.getByText(/не у клиента/)).toBeVisible();

    // Долгая стоянка У КЛИЕНТА помечается, но остаётся стоянкой.
    await expect(page.getByText("Ресторан «Регистан»")).toBeVisible();
    await expect(page.getByText(/долго/)).toBeVisible();

    // СМЕНА — НЕ ОКНО ЗАПИСИ: две отдельные строки. Одна на оба смысла
    // врала бы ровно в том случае, ради которого на экран и смотрят —
    // телефон прислал точку ночью, а человек вышел утром.
    //
    // Часы здесь НЕ сверяем: `clock()` печатает местное время, и та же
    // строка в CI (UTC) и на машине разработки (UTC+5) отличалась бы на пять
    // часов. Проверяем то, что от пояса не зависит.
    await expect(page.getByText(/Смена:/)).toBeVisible();
    await expect(page.getByText(/Запись:/)).toBeVisible();
    // Смена в ответе есть — значит «не открывалась» появиться не может.
    await expect(page.getByText(/не открывалась/)).toHaveCount(0);
  });
});
