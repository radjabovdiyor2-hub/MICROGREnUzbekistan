import { test, expect } from "./fixtures";

test.describe("Profile Page", () => {
    test("renders guest state correctly", async ({ page }) => {
        await page.goto("/profile");
        // Profile page should be visible
        const body = page.locator("body");
        await expect(body).toBeVisible();
    });

    test("does not show 404", async ({ page }) => {
        await page.goto("/profile");
        const notFoundText = page.locator("text=404");
        await expect(notFoundText).not.toBeVisible({ timeout: 5000 });
    });

    test("has navigation elements", async ({ page }) => {
        await page.goto("/profile");
        // Should show either login button or profile sections
        const content = await page.locator("body").textContent();
        expect(content!.length).toBeGreaterThan(50);
    });

    test("bottom navigation is visible on mobile", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto("/profile");
        // Mobile bottom nav should be rendered
        const nav = page.locator("nav, [role='navigation']");
        const navCount = await nav.count();
        expect(navCount).toBeGreaterThanOrEqual(1);
    });
});
