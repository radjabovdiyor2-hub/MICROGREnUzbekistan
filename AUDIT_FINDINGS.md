# Результаты аудита: MICROGREnUzbekistan

## Резюме и методика
Аудит репозитория (ветка `gemini-audit`) проведен с использованием статического анализа и серии офлайн-тестов в изолированном виртуальном окружении Windows 11.
Рантайм-тестирование с реальными токенами API и запуск Docker-контейнеров НЕ производились.

## ИСПРАВЛЕННЫЕ ПРОБЛЕМЫ (Критические + Шаг 3)

1. **Poison Task (зависание очереди)**
   - **Локация:** `apps/tgas/shared/bot_bus.py:250` (start_listener)
   - **Симптом:** При неизвестном action функция возвращала управление до `claim_task`. Задачи навсегда оставались в папке `pending` и блокировали цикл.
   - **Фикс:** Вызов `claim_task` перемещен ДО проверки `if action not in handlers`. Теперь неизвестные задачи переносятся в `processing` и завершаются с ошибкой.

2. **Дроп события TASK_CREATED консьюмерами**
   - **Локация:** `apps/tgas/shared/notifications.py`
   - **Симптом:** Консьюмеры (stepan_bot `main.py:683`, support_bot `main.py:238`, hr_bot `main.py:188`) ожидали поле `chat_id` в пейлоаде и молча игнорировали события без него.
   - **Фикс:** Добавлен хелпер `_admin_chat_id()` (берущий первый ID из `settings.admin_telegram_ids` или None). Во все публикации `TASK_CREATED` (`pm_on_order_created`, `pm_on_complaint`, `pm_on_hr_application`) добавлена передача `"chat_id": _admin_chat_id()`.

3. **Неверная классификация задач Степаном**
   - **Локация:** `apps/tgas/bots/stepan_bot/handlers/assistant.py:1079`
   - **Симптом:** Нераспознанные финансовые задачи преобразовывались в первый доступный `action` (`get_balance`) и не сохранялись в БД.
   - **Фикс:** Удалена дефолт-коэрция ("если ключевое слово не найдено — взять первый action"). Реализован корректный фолл-тру в общий путь `INSERT INTO tasks` и публикацию `TASK_CREATED`.

4. **Ошибка UnboundLocalError в HR-боте**
   - **Локация:** `apps/tgas/bots/hr_bot/main.py:192` (приблизительно)
   - **Симптом:** Переменная `task_id` инициализировалась после первого использования в `get_task_keyboard(task_id)`, вызывая ошибку на каждой задаче.
   - **Фикс:** Инициализация `task_id = data.get("task_id")` перенесена ВЫШЕ `get_task_keyboard`.

5. **Отключение командных хэндлеров контент-бота**
   - **Локация:** `apps/tgas/bots/content_bot/main.py` (main)
   - **Симптом:** Бот игнорировал все команды из-за случайно удаленного цикла регистрации роутеров.
   - **Фикс:** Восстановлен цикл `for r in all_routers: dp.include_router(r)` после `test_router`.

6. **Stale-recovery пинг-понг**
   - **Локация:** `apps/tgas/shared/bot_bus.py:137`
   - **Симптом:** При `os.replace` mtime файла сохранялся. Задачи старше 1 часа сразу подпадали под условие очистки зависших процессов в `get_pending_tasks` (now - st_mtime > 3600), вызывая пинг-понг между pending и processing и дублируя выполнение.
   - **Фикс:** Добавлен вызов `os.utime(processing_path, None)` сразу после `os.replace` для обновления mtime.

7. **Неизолированные тесты очереди**
   - **Локация:** `test_bus_race.py:15`
   - **Симптом:** Функция `load_bot_bus` подменяла пути до `spec.loader.exec_module`, но `exec` перезаписывал их обратно значениями из самого модуля (строка 23), из-за чего тест засорял боевую папку.
   - **Фикс:** Подмена путей перенесена ПОСЛЕ `exec_module`, добавлен отсутствующий `COMPLETED_DIR`.

## СРЕДНИЕ ПРОБЛЕМЫ (Только отчёт — требуют архитектурного решения)

* **База данных:**
  - `interactions.interaction_type` CHECK-ограничение (`database/init.sql:236-239`) не содержит значений `'b2b_offer_pending'` и `'b2b_offer_rejected'` (используются в `marketing_bot/main.py:440,477`). Возникнет ошибка вставки на свежей БД (расширение есть только в неподключённом `migrate_v3.py`).
  - Колонки `message_id` и `chat_id` таблицы `tasks` существуют только в одноразовом скрипте `add_columns.py`, но не внесены в `init.sql` (`stepan main.py:726`, `assistant.py:1196`).
  - Значение `payment_method='online'` (`sales payments.py:73`) нарушает CHECK в `init.sql:155-158`.
  - Пул соединений: ~13 процессов ботов/офиса умножить на 30 (pool 20 + overflow 10) = 390 соединений, что превышает дефолтный `max_connections=100` в Postgres.

* **Обработка событий и задач:**
  - Значение `department='delivery'` (`stepan main.py:661-667`) никем не обрабатывается.
  - События `IG_MESSAGE_RECEIVED`, `b2b_outreach_completed`, `LARGE_EXPENSE_ALERT` не имеют подписчиков.
  - Событие `ROLL_CALL` не доходит до `qa`, `rnd`, `devops`.
  - Несогласованная модель завершения задач: боты `qa`/`rnd`/`devops` автоматически шлют `TASK_COMPLETED`, а интерактивные боты ожидают нажатия кнопки.

* **Web-офис:**
  - Маршруты `/orders/{id}/status`, `/api/tasks`, и `POST /webhooks/meta` не имеют аутентификации (безопасность держится только на bind `127.0.0.1`).
  - `/ingest/customer` и `/admin/sync-catalog` без prod hard-fail.
  - HTTP-outbox ретраит ошибки сервера (`>=500`) вечно, не реализован dead-letter.

* **Конфигурация:**
  - Фейковые значения Merchant ID из `config.py:112-119` по умолчанию подставляются в реальные платёжные URL.
  - В файле `docker-compose.prod.yml` сервис `n8n_bridge` затирает весь блок `environment` якоря, теряя переменные вроде `INGEST_SECRET`.
  - PM-бот удален из кодовой базы, но всё еще упоминается в `README`, `.env.example`, списке `AI_BOTS` и `CLASSIFIER_PROMPT`.
  - Модуль `dispatcher.py` не знает про существование отделов `qa`, `rnd`, `devops`.

## СПЕЦИФИКА WINDOWS

- Метод `os.replace` не является взаимоисключающим в Windows. Два локальных процесса, открывших директорию до переименования файла, могут получить "успех", что приводит к доказанным дубликатам при локальной разработке (в тесте `test_bus_race.py`). В продакшен-среде на базе Linux это не проявляется (атомарный POSIX `rename`).
- Функция `os.rename` (и `os.replace`) сохраняет `mtime` файла, что требует принудительного обновления `os.utime()` при обработке очередей.

## ПОЗИТИВНЫЕ АСПЕКТЫ И НАХОДКИ
- Исправлена проблема двойного учета доходов в `sales_bot`.
- `Merchant ID` успешно вынесен в глобальные настройки.
- Восстановлены боты `qa`, `rnd`, `devops` (ключ `dept` изменен на `data.department`).
- Имплементировано удержание фоновых задач `event_bus` от автоматического Garbage Collection.
- Внедрена UPPERCASE-нормализация для всех событий.
- Реализован паттерн durable outbox в модуле `storefront_outbox`.

## ВАЖНО: ДЛЯ КОММИТА
Обязательно включите в коммит следующие новые untracked-файлы (в противном случае чистый чекаут репозитория будет сломан):
- `apps/tgas/shared/task_ui.py`
- `apps/tgas/bots/devops_bot/__init__.py`
- `apps/tgas/bots/qa_bot/__init__.py`
- `apps/tgas/bots/rnd_bot/__init__.py`

## КАК ПРОВЕРИТЬ ВЖИВУЮ (TEST_MATRIX.md)
1. Поднять локальный PostgreSQL.
2. Применить схему из `database/init.sql`.
3. Отправить `POST /ingest/order` с обязательным заголовком `X-Ingest-Secret`.
4. Проверить механизм дедупликации заказов по паттерну `[webapp:<num>]`.
5. Запустить цикл outbox через локальный листенер, настроенный на обработку хуков `STOREFRONT_STATUS_URL`.