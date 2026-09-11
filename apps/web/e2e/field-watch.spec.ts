import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures";
import { loginAsOwner, openAdminTab } from "./adminNav";

// ══════════════════════════════════════════════════════════════════════
// Слежение за одним человеком: от строки «кто в поле» до его экрана.
//
// ЗАЧЕМ СКВОЗНЫМ СЦЕНАРИЕМ. Арифметику проверяют юнит-тесты: возраст
// молчания (`cadence.test.ts`), свежесть точки (`live/route.test.ts`).
// Тихо ломается проводка: число посчитано, отдано дверью — и не доехало до
// разметки. Так уже было с `gaps` и с `day.source`, который приходил с
// самого начала и нигде не рисовался.
//
// ЧТО ЗАГЛУШЕНО И ПОЧЕМУ. Ответ двери выдуман: здесь проверяется не подсчёт,
// а путь от ответа до экрана. `track` пустой НАМЕРЕННО — карта требует
// WebGL, которого в наборе нет, и к этому вопросу она отношения не имеет.
// ══════════════════════════════════════════════════════════════════════

const DAVLAT = {
  id: "emp-1",
  name: "Davlat",
  startedAt: "2026-09-11T05:26:00.000Z",
  meters: 3600,
  stops: 2,
  track: [],
  last: { at: "2026-09-11T07:06:00.000Z", latitude: 39.65, longitude: 66.96, accuracyM: 15 },
  points: 41,
  lastSource: "pwa",
  trimmed: false,
  silentMin: 4,
};

/** Второй человек: сегодня не прислал ни одной точки. Это НЕ молчание. */
const DDD = {
  ...DAVLAT,
  id: "emp-2",
  name: "ddd",
  meters: 0,
  stops: 0,
  last: null,
  points: 0,
  lastSource: null,
  silentMin: null,
};

async function stubLive(page: Page, people: unknown[]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/password", (route) => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/inventory/employees**", (route) =>
    route.fulfill({ json: { employees: [{ id: DAVLAT.id, name: DAVLAT.name }] } }),
  );
  await page.route("**/api/admin/tracking/live**", (route) =>
    route.fulfill({ json: { status: "ok", people, at: Date.now(), silentAfterMin: 15 } }),
  );
}

test.describe("Слежение за человеком в поле", () => {
  test("строка открывает экран одного человека и возвращает обратно", async ({ page }) => {
    await stubLive(page, [DAVLAT, DDD]);
    await loginAsOwner(page);
    await openAdminTab(page, "День в поле");

    // Сотрудник не выбран — владелец видит, кто в поле прямо сейчас.
    await expect(page.getByText(/Сейчас в поле/)).toBeVisible({ timeout: 20_000 });

    // ЧЕМ СНЯТ ДЕНЬ И КАК ЧАСТО ИДУТ ТОЧКИ — это и есть ответ на «почему
    // линия прямая»: сорок одна точка за полтора часа вместо сотен.
    await expect(page.getByText(/браузер/)).toBeVisible();
    await expect(page.getByText(/раз в \d+ мин/)).toBeVisible();

    await page.locator(`#field-person-${DAVLAT.id}`).click();

    // Экран слежения: имя, кнопка назад, время последней точки.
    await expect(page.locator("#field-watch-back")).toBeVisible();
    await expect(page.getByText(/Последняя точка/)).toBeVisible();
    await expect(page.getByText(/Пройдено/)).toBeVisible();

    await page.locator("#field-watch-back").click();
    await expect(page.getByText(/Сейчас в поле/)).toBeVisible();
  });

  test("не прислал ни одной точки — так и сказано, без позиции на карте", async ({ page }) => {
    await stubLive(page, [DDD]);
    await loginAsOwner(page);
    await openAdminTab(page, "День в поле");

    await expect(page.getByText(/Сейчас в поле/)).toBeVisible({ timeout: 20_000 });
    // «Запись не включена» — это НЕ «молчит ноль минут»: чинить их надо
    // по-разному, и словами они обязаны отличаться.
    await expect(page.getByText(/запись дня не включена/).first()).toBeVisible();
    await expect(page.getByText(/молчит/)).toHaveCount(0);

    await page.locator(`#field-person-${DDD.id}`).click();
    await expect(page.locator("#field-watch-back")).toBeVisible();
    // Точки нет — времени последней точки быть не может.
    await expect(page.getByText(/Последняя точка/)).toHaveCount(0);
  });
});
