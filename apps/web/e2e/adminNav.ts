import { expect, type Page } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// Вход в админку и переход на вкладку — один способ на все сценарии.
//
// ЗАЧЕМ ОБЩИЙ ФАЙЛ. Способов было два, написанных порознь двумя сессиями,
// и ОБА содержали одну и ту же ошибку: проверяли видимость бургера сразу
// после «Войти», когда оболочки ещё нет. Проверка честно отвечала «нет»,
// ящик не открывался, и нажатие уходило во вкладку, лежащую за левым краем
// экрана. Playwright уехавший за край элемент считает видимым и честно
// жмёт по нему — поэтому падало позже и в другом месте.
//
// Две копии, разошедшиеся на первой же правке, — это ещё и два разных
// диагноза на один симптом. Поэтому здесь одна реализация, и она берёт
// лучшее из обеих:
//
//   • ждём появления оболочки (.admin-tab) — иначе «виден ли бургер»
//     отвечает про несуществующий элемент;
//   • проверяем ФАКТИЧЕСКОЕ положение ящика, а не класс `open`: панель
//     выезжает анимацией через translateX, и клик, поданный раньше
//     времени, уходит в кнопку с отрицательным x.
// ══════════════════════════════════════════════════════════════════════

/** Войти владельцем. Пароль перехвачен заглушкой сценария. */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/admin");
  await page.getByText("Владелец", { exact: true }).first().click();
  await page.locator("#admin-password").fill("e2e");
  await page.getByRole("button", { name: /Войти|Kirish/ }).click();
}

/**
 * Открыть вкладку админки по подписи.
 *
 * На телефоне список вкладок — выдвижная панель, поэтому сначала
 * открывается ящик и дожидается своего фактического приезда.
 */
export async function openAdminTab(page: Page, name: string): Promise<void> {
  // Оболочка монтируется не мгновенно: «Войти» возвращает управление
  // раньше, чем появляется хоть одна вкладка.
  await page.locator(".admin-tab").first().waitFor({ timeout: 15_000 });

  const burger = page.locator(".mobile-menu-btn");
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
    await expect
      .poll(async () => (await page.locator(".admin-sidebar").boundingBox())?.x ?? -1, {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(0);
  }

  await page.getByRole("button", { name }).first().click();
}

/** Вкладка «Клиенты» → вид «Карта». Ждём сцену, а не просто холст. */
export async function openMap(page: Page): Promise<void> {
  await loginAsOwner(page);
  await openAdminTab(page, "Клиенты");
  await page.getByRole("button", { name: "Карта" }).first().click();
  await expect(page.locator(".admin-map-stage")).toBeVisible();
}
