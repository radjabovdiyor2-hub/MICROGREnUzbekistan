import { expect, type Page } from "@playwright/test";

import { test } from "./fixtures";
import { loginAsSeller, openAdminTab } from "./adminNav";

// ══════════════════════════════════════════════════════════════════════
// «Мой день» у продавца: вкладка была, экрана не было.
//
// ЧТО СЛОМАЛОСЬ МОЛЧА. Вкладка объявлена в `adminTabs`, дверь
// `/api/admin/tracking/day` давно отдаёт продавцу ЕГО день и правильно
// различает права, режим `mine` в компоненте написан — а ветки в роутере
// не было. Человек нажимал «Мой день» и получал пустую страницу: ни
// ошибки, ни объяснения, ни строчки в логе.
//
// Такое не ловится ни типами, ни сборкой: пустой экран компилируется. Ловит
// только сценарий, который нажимает на вкладку и смотрит, что там.
//
// ТРЕК ПУСТОЙ НАМЕРЕННО: карта требует WebGL, а проверяется проводка от
// ответа двери до разметки, а не отрисовка линии.
// ══════════════════════════════════════════════════════════════════════

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

async function stubDay(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/admin/tracking/day**", (route) => route.fulfill({ json: DAY }));
}

test.describe("Мой день у продавца", () => {
  test("вкладка показывает его собственный день, а не пустой экран", async ({ page }) => {
    await stubDay(page);
    await loginAsSeller(page);
    await openAdminTab(page, "Мой день");

    // Заголовок именно «Мой день», а не «День в поле»: это свой день, а не
    // взгляд на чужую работу.
    await expect(page.getByText("Мой день").first()).toBeVisible({ timeout: 20_000 });

    // Числа доехали до разметки — ровно то, чего не происходило.
    await expect(page.getByText(/Пройдено/)).toBeVisible();
    await expect(page.getByText(/12\.4 км|12,4 км/)).toBeVisible();
    await expect(page.getByText(/приложение/)).toBeVisible();
  });

  test("выбора сотрудника здесь нет — выбирать не из кого", async ({ page }) => {
    await stubDay(page);
    await loginAsSeller(page);
    await openAdminTab(page, "Мой день");

    await expect(page.getByText(/Пройдено/)).toBeVisible({ timeout: 20_000 });
    // Сервер узнаёт человека по подписи, а не по телу запроса: список
    // сотрудников здесь открыл бы чужой день подстановкой.
    await expect(page.getByText("Выберите сотрудника")).toHaveCount(0);
  });

  // ══════════════════════════════════════════════════════════════════
  // Три состояния, которых продавец не видел ВООБЩЕ.
  //
  // Отрисовка «собираю», «трека нет» и отказа была завязана на выбранного
  // сотрудника, а в своём дне выбирать некого — условие никогда не
  // выполнялось. День без трека выглядел как сломанный экран: ни строки.
  // ══════════════════════════════════════════════════════════════════
  test("трека за день нет — сказано словами, а не пустым экраном", async ({ page }) => {
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/admin/tracking/day**", (route) =>
      route.fulfill({ json: { status: "ok", day: null, track: [], stays: [], legs: [], idle: [] } }));
    await loginAsSeller(page);
    await openAdminTab(page, "Мой день");

    await expect(page.getByText(/Трека за этот день нет/)).toBeVisible({ timeout: 20_000 });
  });

  test("дверь отказала — это другой ответ, а не «трека нет»", async ({ page }) => {
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/admin/tracking/day**", (route) =>
      route.fulfill({ status: 401, json: { error: "unauthorized" } }));
    await loginAsSeller(page);
    await openAdminTab(page, "Мой день");

    await expect(page.getByText(/Не удалось загрузить день/)).toBeVisible({ timeout: 20_000 });
    // Вывод о человеке нельзя делать там, где спросить не удалось.
    await expect(page.getByText(/трансляция геопозиции не включалась/)).toHaveCount(0);
  });

  test("«Сейчас в поле» продавцу не показывается — это чужая работа", async ({ page }) => {
    await stubDay(page);
    await loginAsSeller(page);
    await openAdminTab(page, "Мой день");

    await expect(page.getByText(/Пройдено/)).toBeVisible({ timeout: 20_000 });
    // Блок ходит в дверь только для владельца: продавец получал бы 403 по
    // кругу, а заодно видел бы, где ездят коллеги.
    await expect(page.getByText(/Сейчас в поле/)).toHaveCount(0);
  });
});
