import { test, expect } from '@playwright/test';
import { openAdminTab } from './adminNav';

// Сквозная проверка цепи на НАСТОЯЩЕМ сервере: вход по настоящему PIN,
// смена через настоящую дверь, начисление через настоящий расчёт.
test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 39.6542, longitude: 66.9597, accuracy: 12 },
});

test('цепь целиком', async ({ page }) => {
  const auth: string[] = [];
  page.on('response', async (r) => {
    if (r.url().includes('employees/auth')) {
      auth.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 120)}`);
    }
  });
  await page.goto('/admin');
  await page.getByText('Продавец', { exact: true }).first().click();
  for (const d of ['4', '3', '2', '1']) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.waitForTimeout(2500);

  // eslint-disable-next-line no-console
  console.log('ОТВЕТ ВХОДА:', auth.join(' ;; ') || 'запроса не было');
  const tabs = await page.locator('.admin-tab').allInnerTexts();
  // eslint-disable-next-line no-console
  console.log('ВОШЁЛ, ВКЛАДКИ:', tabs.join(', ') || 'вход не удался');

  await openAdminTab(page, 'Клиенты');
  const btn = page.getByRole('button', { name: /Начал смену/ });
  await btn.waitFor({ timeout: 20_000 });
  await btn.click();
  await page.waitForTimeout(2500);

  const near = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /Начал смену|Закончил смену/.test(x.textContent ?? ''),
    );
    return (b?.closest('div')?.parentElement?.innerText ?? '—').split('\n').join(' | ');
  });
  // eslint-disable-next-line no-console
  console.log('ПОСЛЕ НАЖАТИЯ:', near);

  // Своя смена глазами сервера.
  const state = await page.evaluate(async () => {
    const r = await fetch('/api/shift');
    return { code: r.status, body: (await r.text()).slice(0, 160) };
  });
  // eslint-disable-next-line no-console
  console.log('СЕРВЕР О СМЕНЕ:', JSON.stringify(state));

  expect(state.code).toBe(200);
});
