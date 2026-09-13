import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import { loginAsSeller, openAdminTab } from "./adminNav";

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
 * И ВТОРОЕ: запись умирала вместе с вкладкой. Трекер жил в кнопке «Начал
 * смену», а роутер размонтирует неактивную вкладку, — продавец, ушедший в
 * кассу посреди смены, переставал записываться. Второй сценарий ниже.
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

type Sent = { pings?: Array<Record<string, unknown>> };

/**
 * Приёмник крошек и смена — заглушками.
 *
 * СМЕНА ЗАГЛУШЕНА, как и вход по PIN, и по той же причине: сотрудника с
 * таким именем в засеянной базе нет, и настоящая дверь ответила бы
 * «сотрудник не найден». Серверную часть смены закрывают юнит-тесты
 * (`sellerAccess.test.ts`, `shiftPay.test.ts`); здесь проверяется то, что
 * видно только в браузере: нажатие открывает смену, а смена сама включает
 * запись — без второго нажатия.
 */
async function stubField(page: Page, sent: Sent[]): Promise<void> {
    await page.route("**/api/admin/tracking/ping", async (route) => {
        sent.push(route.request().postDataJSON());
        await route.fulfill({ json: { status: "ok", stored: 1, days: [] } });
    });

    let shiftOpen = false;
    await page.route("**/api/shift", async (route) => {
        if (route.request().method() === "POST") {
            const body = route.request().postDataJSON() as { action?: string };
            shiftOpen = body?.action === "open";
        }
        await route.fulfill({
            json: {
                status: "ok",
                open: shiftOpen,
                startedAt: shiftOpen ? new Date().toISOString() : null,
                openedVia: shiftOpen ? "pwa" : null,
            },
        });
    });
}

/** Войти продавцом и открыть смену кнопкой на «Клиентах». */
async function openShift(page: Page): Promise<void> {
    await loginAsSeller(page, "Диагностика");
    await openAdminTab(page, "Клиенты");

    // Кнопка обязана быть видна СРАЗУ, а не после переключения на карту:
    // экран открывается списком, и спрятанная там кнопка есть только для
    // того, кто уже знает, что она там.
    const button = page.getByRole("button", { name: /Начал смену/ });
    await button.waitFor({ timeout: 20_000 });
    await button.click();

    // ОДНА КНОПКА ЗАПУСКАЕТ ВСЁ. Отдельного «записывать день» больше нет:
    // если бы запись не слушалась смены, ниже не пришло бы ни одной крошки.
    await expect(page.getByRole("button", { name: /Закончил смену/ })).toBeVisible({
        timeout: 15_000,
    });
}

test("продавец открывает смену, и крошки уходят на сервер", async ({ page, context }) => {
    const sent: Sent[] = [];
    await stubField(page, sent);
    await openShift(page);

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

test("запись не глохнет, когда продавец уходит в кассу", async ({ page, context }) => {
    // РЕГРЕССИЯ. Трекер жил в кнопке «Начал смену», а кнопка — на вкладках
    // «Клиенты» и «Мой рейс». Роутер размонтирует неактивную вкладку, и
    // продавец, открывший кассу посреди смены, переставал записываться: на
    // карте владельца — «молчит», в отчёте — дыра, хотя человек продавал.
    const sent: Sent[] = [];
    await stubField(page, sent);
    await openShift(page);

    await expect.poll(() => sent.length, { timeout: 15_000 }).toBeGreaterThan(0);

    await openAdminTab(page, "Продажи");
    // Кнопки смены на кассе нет — значит, всё, что придёт дальше, пишет
    // запись сеанса, а не кнопка на экране.
    await expect(page.getByRole("button", { name: /Закончил смену/ })).toHaveCount(0);
    const before = sent.length;

    // Уехал на другой конец квартала: крошка обязана уйти и отсюда.
    await context.setGeolocation({ latitude: 39.67, longitude: 66.98, accuracy: 12 });

    await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(before);
});
