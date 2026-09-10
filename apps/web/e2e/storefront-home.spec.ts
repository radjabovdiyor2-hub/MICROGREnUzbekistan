import { test, expect } from "./fixtures";

/**
 * Главная: обещание, порядок блоков и первый шаг воронки.
 *
 * РАДИ ЧЕГО. Витрину переставили под вопросы посетителя, а обещание на
 * первом экране исправили: оно говорило «посеяли сегодня — завтра на
 * столе», хотя от посева до среза неделя, и русская пара при этом
 * обещала «уже сегодня». Две версии одного заголовка говорили разное, и
 * заметил это владелец, а не проверки: обе строки синтаксически
 * безупречны.
 *
 * Здесь проверяется то, что ломается молча в браузере, а не в тестах:
 * порядок блоков, гашение пустого блока и уход события в счётчики.
 *
 * БАЗА НЕ НУЖНА. Блоки «что приготовить» и «журнал» приходят с сервера и
 * без базы честно исчезают — их отсутствие здесь не проверяется. Всё
 * остальное от базы не зависит.
 */

/** Товары для ленты «популярное» — приходят с клиента, поэтому заглушаются. */
const PRODUCTS = {
  items: [
    {
      id: 'p1', nameRu: 'Микрозелень гороха', nameUz: "No'xat mikroko'kati",
      slug: 'micro-pea', price: 18000, unit: 'лоток', images: [], stock: 10,
    },
  ],
};

test.describe('Главная', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/products**', (r) => r.fulfill({ json: PRODUCTS }));
    // Лента молчит — так и бывает, пока не выдан токен Instagram.
    await page.route('**/api/instagram**', (r) => r.fulfill({ json: { posts: [] } }));
  });

  test('обещает срезку, а не посев — на обоих языках', async ({ page }) => {
    for (const [lang, promise] of [
      ['uz', /Bugun kesilgan/],
      ['ru', /Срезано сегодня/],
    ] as const) {
      await page.addInitScript((l) => localStorage.setItem('Microgreen-lang', l), lang);
      await page.goto('/');
      await expect(page.getByText(promise)).toBeVisible();
      // Посев в обещании — та самая ошибка. Её не должно быть ни на одном языке.
      await expect(page.getByText(/ekilgan|посеян/i)).toHaveCount(0);
    }
  });

  test('вторая кнопка первого экрана ведёт ресторанам, а не на телефон', async ({ page }) => {
    // Телефон есть в шапке, подвале и контактах; на /b2b не вело ничего,
    // кроме строки в подвале.
    await page.goto('/');
    const hero = page.locator('#hero-section');
    await expect(hero.locator('a[href="/b2b"]')).toBeVisible();
  });

  test('блоки идут в порядке вопросов посетителя', async ({ page }) => {
    await page.goto('/');
    await page.locator('#featured-section').waitFor({ timeout: 20_000 });

    const order = await page.evaluate(() => {
      const ids = ['hero-section', 'featured-section', 'restaurants-section', 'location-section'];
      return ids
        .map((id) => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top }))
        .filter((x): x is { id: string; top: number } => typeof x.top === 'number')
        .map((x) => x.id);
    });

    // Товар → ресторанам → как получить. Раньше между ними лежали лента
    // соцсети и калькулятор питания.
    expect(order).toEqual([
      'hero-section',
      'featured-section',
      'restaurants-section',
      'location-section',
    ]);
  });

  test('блок фермы исчезает, когда Instagram молчит', async ({ page }) => {
    // Заголовок «Как мы выращиваем» над пустым местом обещает то, чего
    // посетитель не увидит.
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator('#farm-section')).toHaveCount(0);
  });

  test('переход к товару уходит в счётчики', async ({ page }) => {
    // Первый шаг воронки не считался нигде: она начиналась с «положил в
    // корзину». Проверяем сам вызов, а не надпись на карточке.
    await page.addInitScript(() => {
      (window as unknown as { __events: unknown[] }).__events = [];
      (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...args: unknown[]) => {
        (window as unknown as { __events: unknown[] }).__events.push(args);
      };
    });
    await page.goto('/');
    await page.locator('a[href^="/product/"]').first().waitFor({ timeout: 20_000 });
    await page.locator('a[href^="/product/"]').first().click();

    const events = await page.evaluate(
      () => (window as unknown as { __events: unknown[][] }).__events,
    );
    expect(events.some((e) => e[0] === 'event' && e[1] === 'select_item')).toBe(true);
  });
});
