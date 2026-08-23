import { test, expect } from "./fixtures";

/**
 * Продажа с точки на карте — сквозным сценарием.
 *
 * РАДИ ЧЕГО ЭТОТ СЦЕНАРИЙ
 *
 * По точке можно было позвонить, доехать и отметить визит — а продать
 * нельзя: касса жила на другой вкладке, куда надо было уйти, найти клиента
 * поиском заново и потерять карту с маршрутом. Продажи с выезда из-за этого
 * шли мимо системы.
 *
 * Здесь проверяется вся цепь: точка → «Продать» → товар → чек, и главное —
 * что в теле запроса стоит ВЫБРАННЫЙ клиент. Именно его отсутствие делало
 * продажу невидимой для карточки: счётчики считаются офисом по `crm_orders`,
 * а туда уходил захардкоженный «Покупатель в магазине».
 *
 * СЕТЬ ЗАГЛУШЕНА НАМЕРЕННО
 *
 * Сценарию нужна не база, а разметка и склейка экранов. База со своим
 * клиентом, координатами и прайсом — это отдельный стенд, которого у набора
 * нет; без заглушек сценарий просто не запускался бы нигде. Контракт
 * запроса при этом проверяется настоящий: тело `POST /api/inventory/pos`
 * сверяется здесь, а его разбор — юнит-тестами `lib/pos/sale.test.ts`.
 *
 * Канвас MapLibre не трогаем: WebGL в headless Chromium идёт через
 * SwiftShader и склонен к ложным падениям (та же причина, что в map.spec).
 * Точка выбирается поиском по названию — это тот же путь к панели.
 */

const CUSTOMER_ID = 1;
const CUSTOMER = "Плов Центр";
const PRODUCT = "Mikrozelen Gorox";
const PRICE = 15000;

/** Одна точка на карте — ровно в той форме, в какой её отдаёт API. */
const COLLECTION = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            id: CUSTOMER_ID,
            geometry: { type: "Point", coordinates: [66.9597, 39.627] },
            properties: {
                n: CUSTOMER,
                t: "b2b",
                st: "healthy",
                sp: 450000,
                oc: 6,
                dl: 4,
                ov: 0.4,
                vt: "mid",
                d: "samarkand-center",
                ct: "restaurant",
                au: null,
                gs: "manual",
                ph: "+998901234567",
                ad: "ул. Регистан, 5",
                gp: "exact",
                lv: 9,
                k: "customer",
            },
        },
    ],
    summary: {
        total: 1,
        placed: 1,
        unplaced: 0,
        byState: { prospect: 0, new: 0, healthy: 1, slipping: 0, at_risk: 0, lost: 0 },
        revenueByState: { prospect: 0, new: 0, healthy: 450000, slipping: 0, at_risk: 0, lost: 0 },
        spentPercentiles: { p50: 450000, p80: 450000 },
        districts: [],
        coverage: { exact: 1, rough: 0, missing: 0, total: 1, percent: 100 },
    },
    unplaced: [],
};

const CARD = {
    id: CUSTOMER_ID,
    name: CUSTOMER,
    phone: "+998901234567",
    email: null,
    telegramId: null,
    telegramUsername: null,
    customerType: "b2b",
    companyName: CUSTOMER,
    companyType: "restaurant",
    audience: null,
    address: "ул. Регистан, 5",
    city: "Samarqand",
    district: "samarkand-center",
    status: "active",
    notes: "",
    source: null,
    createdAt: new Date("2026-01-10").toISOString(),
    lastOrderDate: new Date("2026-08-18").toISOString(),
    ordersCount: 6,
    totalSpent: 450000,
    bonusBalance: 0,
    webAccount: null,
    orders: [],
    interactions: [],
    followups: [],
};

const PRODUCTS = {
    items: [
        {
            id: "p-gorokh",
            nameUz: PRODUCT,
            nameRu: "Микрозелень Горох",
            price: PRICE,
            unit: "лоток",
            costPrice: 9000,
            stock: 12,
            images: [],
            category: { nameUz: "Mikrozelen" },
        },
    ],
};

/** Тела запросов, которые касса отправила на сервер. */
interface Captured {
    sale: Record<string, unknown> | null;
    visit: Record<string, unknown> | null;
}

async function stubAdmin(page: import("@playwright/test").Page, captured: Captured) {
    // Общая заглушка идёт ПЕРВОЙ: Playwright проверяет перехватчики от
    // позднего к раннему, и зарегистрированный последним «**/api/**»
    // перебил бы все точные правила ниже.
    //
    // Всё, что не названо явно, отвечает пустотой: сводки, оповещения и шина
    // событий к предмету сценария не относятся, а висящий запрос — относится.
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));

    // Вход владельца: сервер ставит httpOnly-куку, но экран переключает сам
    // клиент по ответу — значит, для разметки хватает ответа.
    await page.route("**/api/auth/password", (route) =>
        route.fulfill({ json: { valid: true } }),
    );

    await page.route("**/api/admin/customers/map/delivery**", (route) =>
        route.fulfill({ json: { routes: [] } }),
    );
    await page.route("**/api/admin/customers/map**", (route) =>
        route.fulfill({ json: COLLECTION }),
    );
    await page.route("**/api/admin/customers?id=**", (route) =>
        route.fulfill({ json: { customer: CARD } }),
    );
    await page.route("**/api/inventory/customers/prices**", (route) =>
        route.fulfill({ json: { prices: [] } }),
    );
    await page.route("**/api/products**", (route) => route.fulfill({ json: PRODUCTS }));

    await page.route("**/api/admin/customers/visits", async (route) => {
        captured.visit = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true, id: 1 } });
    });

    await page.route("**/api/inventory/pos", async (route) => {
        captured.sale = route.request().postDataJSON();
        await route.fulfill({
            json: {
                success: true,
                saleNumber: "S-20260822-E2E1",
                total: PRICE,
                gross: PRICE,
                discount: 0,
                itemCount: 1,
                paymentMethod: "cash",
                performedBy: "Владелец",
                backdated: false,
                alerts: [],
                soldAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            },
        });
    });
}

/**
 * Перейти на вкладку админки.
 *
 * На телефоне список вкладок — выдвижная панель: сама кнопка в разметке
 * есть, но лежит за краем экрана. Открываем ящик, если он есть, — иначе
 * сценарий проходил бы только на широком окне, то есть ровно не там, где
 * этой кассой пользуются.
 *
 * ПОЧЕМУ ЖДЁМ ПОЯВЛЕНИЯ В РАЗМЕТКЕ, А НЕ СПРАШИВАЕМ ВИДИМОСТЬ СРАЗУ.
 *
 * `loginAsOwner` возвращает управление, нажав «Войти», — оболочка админки
 * к этому моменту ещё не смонтирована. Прежний `isVisible()` в этот
 * момент честно отвечал «нет»: кнопки просто не было. Ящик не открывался,
 * и нажатие уходило во вкладку, лежащую за левым краем экрана.
 *
 * Падало это НЕ там, где ломалось: Playwright считает уехавший за край
 * элемент видимым и честно жмёт по нему, а рвётся сценарий позже — на
 * шаге, который к ящику отношения не имеет.
 *
 * Сама кнопка есть в разметке ВСЕГДА: `.admin-mobile-topbar` прячет не
 * условие в JSX, а медиазапрос (`display: none` до 1024px включительно
 * наоборот — flex). Поэтому ждём появления в DOM на обоих профилях, и
 * только потом спрашиваем видимость — тогда ответ осмысленный.
 */
async function openTab(page: import("@playwright/test").Page, name: string) {
    const burger = page.locator(".mobile-menu-btn");
    await burger.waitFor({ state: "attached", timeout: 30_000 });
    if (await burger.isVisible().catch(() => false)) await burger.click();
    await page.getByRole("button", { name }).first().click();
}

async function loginAsOwner(page: import("@playwright/test").Page) {
    await page.goto("/admin");
    await page.getByText("Владелец", { exact: true }).first().click();
    await page.locator("#admin-password").fill("e2e");
    await page.getByRole("button", { name: /Войти|Kirish/ }).click();
}

test.describe("Продажа с точки на карте", () => {
    test("клик по точке → продать → чек, и клиент уходит на сервер", async ({ page }) => {
        const captured: Captured = { sale: null, visit: null };
        await stubAdmin(page, captured);
        await loginAsOwner(page);

        // Раздел «Клиенты» → вид «Карта».
        await openTab(page, "Клиенты");
        await page.getByRole("button", { name: "Карта" }).first().click();

        // Точку берём поиском, а не кликом по канвасу: путь к панели тот же.
        await page.getByLabel(/Найти заведение/).fill("Плов");
        await page.getByRole("button", { name: new RegExp(CUSTOMER) }).first().click();

        // Панель точки открылась — и в ней есть продажа.
        const sell = page.getByRole("button", { name: "Продать" });
        await expect(sell).toBeVisible();
        await sell.click();

        // Касса на точке: покупатель подставлен, искать его заново не надо.
        await expect(page.getByText(CUSTOMER).first()).toBeVisible();

        await page.locator(".pos-product-card").first().click();
        await page.getByRole("button", { name: /^Продать · / }).click();

        // Чек показан здесь же, не уводя с карты.
        await expect(page.getByText(/S-20260822-E2E1/)).toBeVisible({ timeout: 15_000 });

        // Главное: продажа ушла с ВЫБРАННЫМ клиентом и пометкой выезда.
        expect(captured.sale, "касса не отправила чек").not.toBeNull();
        expect(captured.sale).toMatchObject({ customerId: CUSTOMER_ID, origin: "field" });
        // Ключ идемпотентности обязателен: без него повтор запроса пробьёт
        // второй чек и спишет товар дважды.
        expect(typeof captured.sale?.clientKey).toBe("string");

        // Продажа — это и визит: иначе история поездок теряется ровно на
        // самых удачных заездах.
        await expect.poll(() => captured.visit, { timeout: 10_000 }).not.toBeNull();
        expect(captured.visit).toMatchObject({ customerId: CUSTOMER_ID, type: "visit_deal" });
    });
});
