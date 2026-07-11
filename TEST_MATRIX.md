# TEST_MATRIX

Status: VERIFIED_PHASE_1

Матрица тестирования для проверки работы компонентов.

## 1. Запуск инфраструктуры (Phase 2 - Запланировано)
- [ ] `docker compose -f docker-compose.prod.yml up -d postgres redis`
- [ ] Проверка успешного выполнения `init.sql` без ошибок.
- [ ] Проверка миграций Prisma `db-push` для Storefront.

## 2. Кросс-коммуникация ботов (Bot Bus)
- [ ] Запуск `stepan_bot` + `sales_bot`.
- [ ] Отправка тестовой задачи через файловую шину.
- [ ] Подтверждение атомарного захвата (claim_task) и отсутствия гонки потоков.

## 3. Web Office & HTTP Event Bus
- [ ] Проверка endpoint `/ingest/order` - успешное создание заказа в БД `microgreen` при запросе извне с X-Ingest-Secret.
- [ ] Доставка события `ORDER_CREATED` из `web_office` в `stepan_bot` (POST на 127.0.0.1:8081/event).

## 4. Конфигурация
- [ ] Сверка `config.py` vs `.env` (проверка, что боты подключаются к базе `microgreen`, а не `microgreen_uz`).
