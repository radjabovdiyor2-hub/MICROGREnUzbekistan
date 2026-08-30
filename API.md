# API — Microgreen Uzbekistan

Base URL: `https://microgreenuzbekistan.com/api`

**30 групп, 117 route-файлов.** Список ниже сверен с каталогом
`apps/web/src/app/api/`, а не дописан по памяти. Раньше здесь значились восемь
эндпоинтов, которых нет и не было, — в том числе `POST /api/sms`, из-за
которого витринный бот месяцами получал 404 (этот случай конституция
специально занесла в память как урок «список сверять с каталогом»).

Полный перечень групп: `admin`, `ai`, `auth`, `categories`, `config`, `content`,
`events`, `health`, `instagram`, `inventory`, `leads`, `magazine`,
`marketing`, `menu`, `metrics`, `notify`, `orders`, `payment`,
`products`, `promo`, `push`, `referral`, `reviews`, `subscriptions`,
`support`, `telegram`, `upload`, `users`, `whatsapp`.

## Авторизация

Единая точка — `apps/web/src/middleware.ts`, правила по префиксу пути:

| Доступ | Кто проходит |
|---|---|
| `ADMIN` | подписанная сессия с ролью ADMIN |
| `STAFF` | ADMIN или SELLER |
| `CUSTOMER` | любая валидная сессия покупателя (владельца записи проверяет сам роут) |

Витринный бот проходит мимо правил по общему секрету: заголовок
`X-Bot-Secret` или `Authorization: Bearer <BOT_SECRET>` (сравнение в
постоянном времени). Telegram `initData` проверяется только в
`auth/telegram-webapp`; всё остальное держится на подписанной cookie-сессии
(`lib/session.ts`) — здесь было написано, что аутентификация вся на `initData`.

## Products & Catalog

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/products` | Каталог с фильтрами и пагинацией. Ответ — `{ items, pagination }`, **не массив**. Поля — белый список (`lib/products/fields.ts`); `costPrice` уходит только сотруднику. `?all=true` (показать скрытые) — только под `isStaff` |
| GET | `/api/products/[id]` | Карточка товара |
| POST/PUT/PATCH/DELETE | `/api/products` | CRUD (ADMIN) |
| GET | `/api/products/export` | Выгрузка каталога |
| GET | `/api/categories` | Дерево категорий (слаги: `microgreens`, `baby-leaf`, `salads`, `flowers`, `seeds`, `equipment`, `sets`) |

## Orders

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/orders` | Создать заказ — **единственная дверь**. Цены берутся из каталога; присланная `price` игнорируется (кроме доверенного вызывающего с общим секретом — у него договорная цена и `performedBy` принимаются). `quantity` дробное, до двух знаков. Ответ: `{ success, order: { id, orderNumber, total, status } }` |
| GET | `/api/orders` | Список: покупателю — свои (по сессии), админке и боту — с фильтрами |
| PUT | `/api/orders` | Смена статуса (ADMIN или общий секрет — проверяется и в middleware, и в самом роуте) |
| POST | `/api/orders/status` | Обратная синхронизация статуса из офиса |
| GET | `/api/admin/orders`, `/api/admin/orders/[id]` | Заказы для админки и бота |

Публичного `/api/orders/[id]` нет: он отдавал адрес и телефон любому, у кого
есть id заказа, и вызывающих у него не было.

## Users & Auth

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/auth/register` | Регистрация по телефону (телефон нормализуется, `lib/phone.ts`) |
| POST | `/api/auth/telegram`, `/api/auth/telegram-webapp` | Вход через Telegram |
| POST | `/api/auth/password` | Пароль владельца |
| GET/POST | `/api/auth/webauthn` | Вход по Face ID / Touch ID: подпись проверяет `@simplewebauthn`, GET отвечает, привязан ли ключ |
| GET/POST | `/api/users/telegram` | Пользователь по `?telegramId=`; ответ — `{ user }` |
| GET | `/api/users/telegram/[id]/bonuses` | Баланс баллов (свой, бот или сотрудник) |
| GET | `/api/users/inactive` | Клиенты без заказов за N дней (для кампании возврата, только бот) |
| POST | `/api/users/data` | Экспорт и удаление своих данных |
| GET | `/api/referral` | Реферальные правила и статистика |

## AI & Content

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/ai/chat` | ИИ-агроном. Клиента находит по `userId` (cuid) или `telegramId` |
| GET | `/api/content/recipe-of-day` | Рецепт дня |
| GET | `/api/instagram` | Прокси ленты Instagram |
| GET | `/api/menu`, `/api/magazine/current` | Свежий номер FRESH WEEKLY (витрина и бот) и меню ресторанов |

## Admin & Operations

| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/admin/stats` | Сводка для Telegram-панели (выручка без отменённых и возвращённых) |
| GET | `/api/admin/finance` | Доходы, расходы и P&L по деловой дате. Аналитика — `/api/inventory/analytics`: дубль `/api/admin/analytics` удалён, его не звал никто |
| GET/POST | `/api/inventory`, `/api/inventory/movements` | Склад: остатки и движения. Количество дробное (два знака) |
| POST/PUT/GET | `/api/inventory/pos` | Касса (STAFF). POST — продажа, PUT — возврат, GET — отчёт смены. Тело продажи: `items[{productId, quantity, price, priceReason}]`, `paymentMethod`, `customerId?`, `discount?{type,value,reason}`, `soldAt?` + `backdateReason?`, `performedBy?` (только у ADMIN). Цена не по прайсу требует `priceReason`; продавец проводит задним числом не глубже 7 суток, владелец — без предела, будущее закрыто всем |
| GET | `/api/inventory/customers` | Поиск покупателя для кассы по имени и телефону (STAFF). Отдаёт только имя, компанию и телефон — карточка целиком остаётся под ADMIN |
| GET/PUT/DELETE | `/api/inventory/customers/prices` | Договорные цены клиента. Читает касса (STAFF), меняет только владелец |
| GET/POST/PUT/DELETE | `/api/admin/customers/contacts` | Контактные лица заведения: имя, роль, телефон, признак утверждающего закупку. Продукт выбирает шеф, а закупку утверждает управляющий — в карточке нужны оба (ADMIN) |
| GET/POST/PUT | `/api/admin/owner` | Практики владельца: каталог с сериями (GET), отметка «сделано» за дату (POST), свой ритм и заметка (PUT). Без аудита намеренно — это личные отметки владельца, а не действия сотрудника с данными дела (ADMIN) |
| GET/POST | `/api/admin/*` | Ещё ~45 роутов: магазин журнала, сырьё, смены, настройки, Стёпан |

## Integrations

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/payment/click`, `/api/payment/payme` | Колбэки платёжных провайдеров (подпись проверяется). **Онлайн-оплаты в витрине нет:** платёжную ссылку для заказа не создаёт никто, поэтому на оформлении остались наличные, карта и перевод — то есть оплата при получении. Колбэки работают и ждут рабочих merchant-контрактов; единственный, кто сейчас строит ссылки, — тираж журнала (`/api/admin/magazine/print-orders`, только при заданных `CLICK_MERCHANT_ID`/`PAYME_MERCHANT_ID`). Возвращать Click и Payme на оформление можно только вместе с созданием платежа: словарь `payment.methods` их не принимает |
| POST | `/api/notify` | Push-уведомления (ADMIN) |
| POST | `/api/leads` | Захват лида |
| POST | `/api/support` | Обращение в поддержку |
| POST | `/api/reviews` | Отзыв (автор — из сессии, бота или гостевого хеша) |
| GET | `/api/health`, `/api/metrics` | Здоровье и метрики |
| POST | `/api/whatsapp/webhook` | Сообщение клиента → касание в CRM + сигнал владельцу |
| POST | `/api/telegram/*` | Вебхуки Telegram. `/api/telegram/channel` — дверь издателя: офис публикует через неё в канал и группу (текст + картинка ссылкой) |
| POST | `/api/channels/<код>/orders` | Заказ с площадки (Uzum, Tezkor, Yandex Eats). Идемпотентно по `(канал, externalId)`: повтор вебхука возвращает тот же номер заказа, а не создаёт второй. Заказ создаётся общей дверью витрины — остаток списывается, зеркало в CRM уходит. Заказ сверх остатка принимается (площадка уже продала), но поднимает сигнал `channel_oversell`: на витрине «под заказ» — норма, на маркетплейсе отмена стоит процентов от суммы и рейтинга |
| GET | `/api/channels/cron/sync` | Синхронизация каналов по расписанию: посчитать разницу остатков и разобрать очередь. Планировщик ходит с `BOT_SECRET`. В ответе есть `stalled` — каналы, чья очередь стоит дольше шести часов; офис превращает их в сигнал владельцу, по одному на канал, а не каждые пять минут |

**Товарные фиды лежат ВНЕ `/api/`** — `/feed/google.xml`, `/feed/agents.json`,
`/feed/meta.csv` (параметр `?lang=uz|ru`). Причина простая: в `robots.ts` весь
`/api/` закрыт, и робот Merchant Center за фидом туда не пойдёт.

Там же `/llms.txt` — короткая карта магазина для ИИ-агентов (llmstxt.org):
доставка, контакты, разделы каталога и ссылка на `/feed/agents.json`. Товаров
в нём нет намеренно: цены и остатки живут в фиде, второй их список однажды
разошёлся бы с первым. Файл переживает недоступную базу — раздел про
ассортимент тогда честно говорит, что списка нет.


SMS-группы нет. `/api/marketing/digest` существует, но отвечает 501: рассылки
не реализовано — ни выборки подписчиков, ни транспорта.

Группы `game` нет: приложение игры удалено вместе с каталогом `apps/game`,
и строка `/api/game/nft/mint` в этой таблице описывала маршрут, которого не
существует. Группы `ecosystem` тоже нет: её единственный роут принимал
событие, писал строку в лог и отвечал `{"received": true}` — дверь
выглядела рабочей, ничего не делая, и звал её метод без вызывающих.

## AI Office API (apps/tgas/web_office)

Base URL: `http://web_office:8050` (только внутренняя сеть)

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/ingest/order` | Заказ с витрины → зеркало в `crm_orders` → `ORDER_CREATED` |
| POST | `/ingest/order-status` | Смена статуса заказа |
| POST | `/ingest/customer`, `/ingest/support`, `/ingest/lead`, `/ingest/feedback` | Остальные сигналы витрины |
| GET | `/` | Дашборд (FastAPI HTML) |
| GET | `/funnel`, `/learnings`, `/health/bots` | Воронка, обучение, здоровье ботов |

Auth: заголовок `X-Ingest-Secret` для `/ingest/*`. **В проде переменная
`INGEST_SECRET` обязательна**: при пустом значении и `ENVIRONMENT=production`
все `/ingest/*` отвечают 401, а витрина глушит ошибку — заказ появляется на
сайте, но офис о нём не узнаёт.

## Event Bus Events (apps/tgas)

| Event | Payload | Publisher | Consumers |
|-------|---------|-----------|-----------|
| `ORDER_CREATED` | `order_id, order_number, total_amount, items_summary` | web_office (зеркало) | stepan, finance, analytics |
| `TASK_CREATED` | `task_id, department, title, description, chat_id` | `tasks_repo.create` | бот отдела |
| `TASK_COMPLETED` | `task_id` | любой бот, Стёпан | stepan |
| `COMPLAINT_RECEIVED` | `summary, customer_name` | support | stepan |
| `ORDER_STATUS_CHANGED` | `order_id, order_number, status` | витрина | finance |

Payload передаётся ПЛОСКИМ: `publish()` сам оборачивает его в
`{event, data, source, timestamp}`.

## Rules

- Все роуты отвечают JSON.
- Формат ошибки: `{ error: string }` (поля `code` ни один роут не возвращает).
- Пагинация: `?page=1&limit=20`, потолок `limit` — 100.
- Отказ зависимости — это 5xx, а не пустой успешный ответ.
- Перед созданием нового роута — прочитать каталог `apps/web/src/app/api/` и
  дописать сюда. Сверять с каталогом, а не с этим файлом по памяти.
