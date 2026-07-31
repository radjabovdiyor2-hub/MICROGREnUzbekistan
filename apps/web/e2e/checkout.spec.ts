import { test, expect } from "./fixtures";

test.describe('Checkout Flow', () => {
  test('should show error message when API fails (preventing fake orders)', async ({ page }) => {
    // 1. Mock catalog API to always return 1 product
    await page.route('/api/products*', async route => {
      await route.fulfill({
        status: 200,
        json: {
          items: [
            {
              id: 'test-1',
              nameUz: 'Test Mahsulot',
              nameRu: 'Test Product',
              slug: 'test-1',
              price: 15000,
              images: ['/test.jpg'],
              rating: 5,
              reviewCount: 0
            }
          ],
          pagination: { page: 1, limit: 24, total: 1, totalPages: 1 }
        }
      });
    });

    await page.goto('/catalog');
    
    // Add to cart
    await page.waitForSelector('.product-card');
    await page.getByRole('button', { name: /Savatga|В корзину/i }).first().click();

    // 2. Go to cart
    await page.goto('/cart');

    // Click 'Buyurtma berish' to go to checkout step
    await page.locator('#go-checkout-btn').click();

    // Fill form using IDs
    await page.locator('#checkout-name').fill('Test User');
    await page.locator('#checkout-phone').fill('+998901234567');
    await page.locator('#checkout-address').fill('Test Address 123');

    // 3. Заказ отклоняется сервером.
    //
    // Раньше здесь стоял route.abort('failed') в паре с waitForResponse:
    // у оборванного запроса ответа не бывает никогда, поэтому ожидание
    // висело до таймаута и сценарий падал ещё до самой проверки. Отдаём
    // честную пятисотку — путь обработки ошибки в UI тот же, а ответ есть.
    await page.route('/api/orders', async route => {
      await route.fulfill({ status: 500, json: { error: 'Xatolik' } });
    });

    await Promise.all([
      page.waitForResponse('/api/orders'),
      page.locator('#submit-order-btn').click()
    ]);

    // 4. Verify that error message appears.
    // Селектор '.card' указывал на обёртку, в которой сообщения об ошибке нет:
    // оно рендерится отдельным блоком. Привязываемся к якорю #order-error,
    // как это уже сделано для #submit-order-btn и полей формы.
    await expect(page.locator('#order-error')).toContainText(/xatolik|ошибка/i);

    // 5. Verify that cart is NOT cleared
    await expect(page.getByText(/Savat bo'sh|Корзина пуста/i)).not.toBeVisible();
  });
});
