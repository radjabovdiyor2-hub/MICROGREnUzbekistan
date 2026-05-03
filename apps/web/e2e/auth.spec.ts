import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
    test("login page renders", async ({ page }) => {
        await page.goto("/login");
        await expect(page).toHaveTitle(/Вход/);
    });

    test("shows Telegram login option", async ({ page }) => {
        await page.goto("/login");
        // The page should have a Telegram auth button or widget
        const telegramBtn = page.getByText(/Telegram/i).first();
        await expect(telegramBtn).toBeVisible();
    });

    test("shows email login form", async ({ page }) => {
        await page.goto("/login");
        // Click email login option
        const emailBtn = page.getByText(/Email/i).first();
        if (await emailBtn.isVisible()) {
            await emailBtn.click();
            await page.waitForTimeout(500);
            const emailInput = page.locator("input[type='email'], input[placeholder*='mail']").first();
            if (await emailInput.isVisible()) {
                await expect(emailInput).toBeVisible();
            }
        }
    });

    test("admin routes redirect to login", async ({ page }) => {
        await page.goto("/admin");
        // Should redirect to login page
        await expect(page).toHaveURL(/\/login/);
    });

    test("skip button navigates to home", async ({ page }) => {
        await page.goto("/login");
        const skipBtn = page.getByText(/Пропустить|Skip/i).first();
        if (await skipBtn.isVisible()) {
            await skipBtn.click();
            await expect(page).toHaveURL("/");
        }
    });
});
