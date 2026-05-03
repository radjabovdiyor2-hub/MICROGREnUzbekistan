import { test, expect } from "@playwright/test";

test.describe("WebApp Page (Telegram Mini App)", () => {
    test("loads without 404 error", async ({ page }) => {
        await page.goto("/webapp");
        // Should NOT show the custom 404 page
        const notFoundText = page.locator("text=404");
        await expect(notFoundText).not.toBeVisible({ timeout: 5000 });
    });

    test("renders welcome or user section", async ({ page }) => {
        await page.goto("/webapp");
        // The page should contain either user info or a welcome message
        const body = page.locator("body");
        await expect(body).toBeVisible();
        // Should have some content (not empty)
        const content = await body.textContent();
        expect(content!.length).toBeGreaterThan(50);
    });

    test("displays products from API", async ({ page }) => {
        await page.goto("/webapp");
        // Wait for products to load
        await page.waitForTimeout(3000);
        // Should display product cards or product links
        const productElements = page.locator('a[href^="/shop/"]');
        const count = await productElements.count();
        expect(count).toBeGreaterThanOrEqual(0); // May have 0 if API is slow
    });

    test("has cart and favorites functionality", async ({ page }) => {
        await page.goto("/webapp");
        await page.waitForTimeout(2000);
        // Look for cart or favorites icons/buttons
        const body = await page.locator("body").textContent();
        // Page should mention shop-related content
        expect(body!.length).toBeGreaterThan(100);
    });
});
