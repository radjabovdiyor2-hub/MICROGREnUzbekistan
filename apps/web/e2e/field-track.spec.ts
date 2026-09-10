import { test, expect } from "./fixtures";
import { openAdminTab } from "./adminNav";

/**
 * Запись дня браузером — сквозным сценарием.
 *
 * РАДИ ЧЕГО ЭТОТ СЦЕНАРИЙ
 *
 * Трек полевого сотрудника снимался только трансляцией геопозиции в
 * Telegram. Без бота дня не было вовсе — ни километров, ни сверки времени.
 * Браузерная запись закрывает этот случай, и вся её цепь тихая: приёмник
 * не бросает исключений, отказ в доступе выглядит как «просто ничего не
 * происходит», а очередь молча копится в localStorage.
 *
 * ЧТО ЭТОТ СЦЕНАРИЙ УЖЕ ПОЙМАЛ. Сайт запрещал геопозицию собственным
 * заголовком `Permissions-Policy: geolocation=()`. Браузер в таком случае
 * не падает — он отвечает отказом в доступе. Из-за этого не работала и
 * отметка места при визите, причём с первого дня: `readPosition` честно
 * возвращает null, и координаты просто не прикладывались. Ни один
 * юнит-тест, линтер или сборка этого не видят — геопозицию не трогает
 * никто из них.
 *
 * ПОЧЕМУ ПРОВЕРЯЕМ ТЕЛО ЗАПРОСА, А НЕ НАДПИСЬ НА ЭКРАНЕ. Надпись
 * «запись идёт» рисует состояние кнопки, а не факт отправки. Единственное
 * доказательство работы — пачка крошек, дошедшая до `/api/admin/tracking/
 * ping` с источником `pwa`.
 *
 * База не нужна: вход продавца и приёмник крошек заглушены, а разбор
 * пачки проверяют юнит-тесты `lib/tracking/pingQueue.test.ts` и
 * `lib/tracking/ping.test.ts`.
 */

// Разрешение и стартовая точка объявляются контексту ДО его создания.
// Выданные позже (`grantPermissions` без origin), они достаются about:blank,
// и страница получает отказ — сценарий падал бы на исправном коде.
test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 39.6542, longitude: 66.9597, accuracy: 12 },
});

test("продавец включает запись дня, и крошки уходят на сервер", async ({ page, context }) => {
    const sent: Array<{ pings?: Array<Record<string, unknown>> }> = [];
    await page.route("**/api/admin/tracking/ping", async (route) => {
        sent.push(route.request().postDataJSON());
        await route.fulfill({ json: { status: "ok", stored: 1, days: [] } });
    });
    // PIN проверяет база, которой у набора нет.
    await page.route("**/api/inventory/employees/auth", (r) =>
        r.fulfill({ json: { success: true, employee: { name: "Диагностика" } } }),
    );

    await page.goto("/admin");
    await page.getByText("Продавец", { exact: true }).first().click();
    for (const digit of ["1", "2", "3", "4"]) {
        await page.getByRole("button", { name: digit, exact: true }).click();
    }

    await openAdminTab(page, "Клиенты");

    // Кнопка обязана быть видна СРАЗУ, а не после переключения на карту:
    // экран открывается списком, и спрятанная там кнопка есть только для
    // того, кто уже знает, что она там.
    const button = page.getByRole("button", { name: /Записывать день/ });
    await button.waitFor({ timeout: 20_000 });
    await button.click();

    // Первую крошку хук отдаёт сразу; сдвиг проверяет правило «уехал —
    // пиши, не дожидаясь интервала».
    await page.waitForTimeout(2_000);
    await context.setGeolocation({ latitude: 39.66, longitude: 66.97, accuracy: 12 });

    await expect.poll(() => sent.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const pings = sent[0].pings ?? [];
    expect(pings.length).toBeGreaterThan(0);
    // Источник — не украшение: по нему день помечается `pwa` или `mixed`,
    // и от этого зависит, считать ли дыры в треке поводом спросить.
    expect(pings[0].source).toBe("pwa");
    expect(typeof pings[0].latitude).toBe("number");
    expect(typeof pings[0].at).toBe("number");

    // Отказ в доступе не должен выглядеть как работающая запись.
    await expect(page.getByText(/Доступ к геопозиции закрыт/)).toHaveCount(0);
});
