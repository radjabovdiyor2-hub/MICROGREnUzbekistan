import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
    test("renders hero section with title", async ({ page }) => {
        await page.goto("/");
        await expect(page).toHaveTitle(/AgroTech Ecosystem/);
        await expect(page.locator("body")).toBeVisible();
    });

    test("navigation links are visible on desktop", async ({ page }) => {
        await page.goto("/");
        const nav = page.locator("header nav, header");
        await expect(nav).toBeVisible();
    });

    test("shop link navigates to catalog", async ({ page }) => {
        await page.goto("/");
        await page.click('a[href="/shop"]');
        await expect(page).toHaveURL(/\/shop/);
    });

    test("has JSON-LD structured data", async ({ page }) => {
        await page.goto("/");
        const jsonLd = page.locator('script[type="application/ld+json"]');
        await expect(jsonLd.first()).toBeAttached();
    });

    test("noscript fallback content exists", async ({ page }) => {
        await page.goto("/");
        const noscript = page.locator("noscript");
        await expect(noscript).toBeAttached();
    });
});
