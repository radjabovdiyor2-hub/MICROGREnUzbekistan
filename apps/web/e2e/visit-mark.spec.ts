import { test, expect } from "./fixtures";
import { openMap } from "./adminNav";
import { stubAdmin } from "./mapStubs";
import type { Page, Request } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// «СЪЕЗДИЛ — ОТМЕТЬ»: ОТ ПАЛЬЦА ДО ТЕЛА ЗАПРОСА.
//
// ЗАЧЕМ. Владелец сказал: «не работают отметки клиентов — договорились,
// перезвонить и так далее». Дверь, которая их пишет, разобрана отдельно
// (`visits/route.test.ts`) и оказалась исправной: разбор, расстояние,
// закрытие остановки плана по местной полуночи — всё на месте.
//
// Оставался ровно один непроверенный участок цепи: нажатие → `markVisit`
// → тело запроса. Юнит-тест его не видит (там React и сеть), тест двери
// не видит тоже (он начинается с уже пришедшего запроса). А ломается в
// таких местах тише всего: кнопка нажимается, вид меняется, и ничего не
// уходит.
//
// ЗДЕСЬ ПРОВЕРЯЕТСЯ НЕ «ПРИШЁЛ ОТВЕТ 200» — заглушка ответит что угодно.
// Проверяется, ЧТО ИМЕННО ушло на сервер: тот ли исход, та ли заметка,
// тот ли клиент. Подменив исход местами, тест бы этого не заметил, если
// смотреть только на зелёную галочку в интерфейсе.
// ══════════════════════════════════════════════════════════════════════

/** Тела запросов на отметку визита, в порядке отправки. */
function captureVisits(page: Page): Record<string, unknown>[] {
  const sent: Record<string, unknown>[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && r.url().includes("/api/admin/customers/visits")) {
      sent.push(r.postDataJSON());
    }
  });
  return sent;
}

/** Открыть карточку точки поиском: тот же путь, что у человека. */
async function openPoint(page: Page, name: string) {
  const search = page.getByPlaceholder(/Найти заведение|Joy topish/);
  if ((await search.count()) === 0) {
    await page.getByRole("button", { name: /Поиск|Qidiruv/ }).first().click();
  }
  await search.first().fill(name.slice(0, 4));
  await page.getByText(name).first().click();
}

test.describe("Отметка визита с карты", () => {
  test("«Договорились» уходит на сервер с нужным исходом и клиентом", async ({ page }) => {
    await stubAdmin(page);
    const sent = captureVisits(page);
    await page.route("**/api/admin/customers/visits", (route) =>
      route.fulfill({ json: { ok: true, id: 1 } }),
    );

    await openMap(page);
    await openPoint(page, "Плов Центр");

    await page.getByRole("button", { name: "Договорились" }).click();

    // Подтверждение на экране — ради него человек и жмёт.
    await expect(page.getByText(/Отмечено/).first()).toBeVisible({ timeout: 15_000 });

    expect(sent).toHaveLength(1);
    // Точка «Плов Центр» — первая в наборе заглушек.
    expect(sent[0].customerId).toBe(1);
    expect(sent[0].type).toBe("visit_deal");
    // Время визита обязательно: без него отметка из очереди легла бы
    // сегодняшним числом, а не тем днём, когда человек там был.
    expect(typeof sent[0].visitedAt).toBe("number");
  });

  test("«Перезвонить» — это другой исход, а не то же самое", async ({ page }) => {
    // Четыре кнопки, отличающиеся одной строкой, — классическое место,
    // где перепутанный индекс не замечает никто: интерфейс одинаково
    // говорит «Отмечено» на любой из них.
    await stubAdmin(page);
    const sent = captureVisits(page);
    await page.route("**/api/admin/customers/visits", (route) =>
      route.fulfill({ json: { ok: true, id: 2 } }),
    );

    await openMap(page);
    await openPoint(page, "Плов Центр");

    await page.getByRole("button", { name: "Перезвонить" }).click();
    await expect(page.getByText(/Отмечено/).first()).toBeVisible({ timeout: 15_000 });

    expect(sent[0].type).toBe("visit_callback");
  });

  test("отказ двери показывается словами, а не тихой галочкой", async ({ page }) => {
    // 400 — это «отметка негодна», и повторять её в очереди бессмысленно.
    // Человек должен узнать об этом на месте: он ещё стоит у дверей.
    await stubAdmin(page);
    await page.route("**/api/admin/customers/visits", (route) =>
      route.fulfill({ status: 400, json: { error: "Неизвестный результат визита" } }),
    );

    await openMap(page);
    await openPoint(page, "Плов Центр");

    await page.getByRole("button", { name: "Договорились" }).click();

    await expect(page.getByText(/Неизвестный результат визита/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/^Отмечено$/)).toHaveCount(0);
  });
});
