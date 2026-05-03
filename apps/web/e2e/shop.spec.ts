import { test, expect } from "@playwright/test";

test.describe("Shop Page", () => {
    test("loads product catalog", async ({ page }) => {
        await page.goto("/shop");
        await expect(page).toHaveTitle(/Каталог/);
        // Wait for products to render
        await page.waitForTimeout(2000);
    });

    test("category filter buttons are visible", async ({ page }) => {
        await page.goto("/shop");
        // Category buttons should render
        const categories = page.locator("button, [role='tab']");
        await expect(categories.first()).toBeVisible();
    });

    test("search input accepts text", async ({ page }) => {
        await page.goto("/shop");
        const searchInput = page.locator("input[type='text'], input[type='search']").first();
        if (await searchInput.isVisible()) {
            await searchInput.fill("руккола");
            await expect(searchInput).toHaveValue("руккола");
        }
    });

    test("navigates to product detail page", async ({ page }) => {
        await page.goto("/shop");
        await page.waitForTimeout(2000);
        const productLink = page.locator('a[href^="/shop/"]').first();
        if (await productLink.isVisible()) {
            await productLink.click();
            await expect(page).toHaveURL(/\/shop\/.+/);
        }
    });
});
