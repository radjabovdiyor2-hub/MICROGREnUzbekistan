# Инструкция по поисковой индексации (SEO & Search Console)

Документ описывает шаг за шагом процессы подтверждения прав на домен, отправку карты сайта (Sitemap), отправку страниц на мгновенную индексацию в Google Search Console и Яндекс.Вебмастере, а также факторы ранжирования вне кода.

---

## 1. Подтверждение прав на сайт

### Google Search Console (GSC)
1. Зайдите в [Google Search Console](https://search.google.com/search-console).
2. Нажмите **«Добавить ресурс»** → выберите **«Ресурс с префиксом URL»** → введите `https://microgreenuzbekistan.com`.
3. В способах подтверждения выберите **«Тег HTML»** (HTML tag).
4. Скопируйте значение из атрибута `content="..."` (например: `abc123google_code`).
5. Установите переменную окружения в Vercel / `.env.production`:
   ```bash
   NEXT_PUBLIC_GSC_VERIFICATION="ваш_код_из_google"
   ```
6. Выполните повторный деплой или перезапуск приложений. Тег автоматически подставится в `<head>` сайта на всех страницах.
7. В панели GSC нажмите **«Подтвердить»**.

### Яндекс.Вебмастер
1. Зайдите в [Яндекс.Вебмастер](https://webmaster.yandex.ru/).
2. Добавьте сайт `https://microgreenuzbekistan.com`.
3. Выберите метод **«Метатег»**.
4. Скопируйте значение из атрибута `content="..."` (например: `1a2b3c4d5e6f7g8h`).
5. Установите переменную окружения:
   ```bash
   NEXT_PUBLIC_YANDEX_VERIFICATION="ваш_код_из_яндекса"
   ```
6. Нажмите **«Проверить»** в Яндекс.Вебмастере.

---

## 2. Отправка карты сайта (Sitemap)

Карта сайта генерируется динамически на основе данных из базы и доступна по адресу:
👉 `https://microgreenuzbekistan.com/sitemap.xml`

### В Google Search Console:
1. Зайдите в раздел **«Файлы Sitemap»** в левом меню.
2. Введите `sitemap.xml` и нажмите **«Отправить»**.
3. Убедитесь, что статус изменился на **«Успешно»**.

### В Яндекс.Вебмастере:
1. Зайдите в раздел **«Индексирование» → «Файлы sitemap»**.
2. Вставьте URL `https://microgreenuzbekistan.com/sitemap.xml` и нажмите **«Добавить»**.

---

## 3. Отправка ключевых страниц на мгновенную индексацию

Чтобы ускорить попадание новых страниц категорий и рецептов в выдачу:

1. В Google Search Console вставьте URL в верхнюю строку поиска (например, `https://microgreenuzbekistan.com/catalog/microgreens`).
2. Нажмите **«Запросить индексирование»** (Request Indexing).
3. Повторите для главных посадочных страниц:
   - `https://microgreenuzbekistan.com/catalog/microgreens`
   - `https://microgreenuzbekistan.com/catalog/salads`
   - `https://microgreenuzbekistan.com/catalog/baby-leaf`
   - `https://microgreenuzbekistan.com/catalog/equipment`
   - `https://microgreenuzbekistan.com/ru/catalog/microgreens`
   - `https://microgreenuzbekistan.com/uz/catalog/microgreens`

---

## 4. Мониторинг и типичные ошибки

* **Страница проиндексирована, но не является канонической**: убедитесь, что все старые ссылки с `?category=microgreens` редиректят с кодом `301` на `/catalog/microgreens`.
* **Ошибки в микроразметке (Rich Results Test)**:
  - Используйте [Google Rich Results Test](https://search.google.com/test/rich-results) для проверки страниц рецептов и товаров.
  - Проверьте наличие полей `name`, `image`, `recipeIngredient`, `recipeInstructions` для `Recipe`.

---

## 5. Факторы ранжирования вне кода (Честный чеклист)

Техническое SEO (которое реализовано в данном проекте) убирает барьеры для поисковых ботов, но позиция №1 зависит от внешних и контентных факторов:

1. **Внешние ссылки (Backlinks)**:
   - Упоминания и ссылки на `microgreenuzbekistan.com` в СМИ, блогах, ресторанных каталогах Узбекистана (Afisha.uz, Gazeta.uz, Spot.uz).
2. **Поведенческие факторы (User Experience)**:
   - Низкий процент отказов, время пребывания на сайте, кликабельность (CTR) сниппета в выдаче.
3. **Возраст и авторитет домена**:
   - Google/Яндекс требуют времени для накопления доверия к домену по высокочастотным запросам.
4. **Обновляемость контента**:
   - Регулярная публикация новых выпусков журнала, рецептов и статей.
