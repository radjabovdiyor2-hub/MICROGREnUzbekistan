# 🌱 Microgreen Uzbekistan — AI Сотрудники

> Система AI-сотрудников в Telegram для полной автоматизации бизнеса микрозелени, салатов, семян, гидропоники и HoReCa снабжения.

## 📋 Структура проекта

```
tgas/
├── docker-compose.yml          # PostgreSQL + Redis
├── .env.example                # Шаблон переменных
├── .env                        # Ваши переменные (создайте из .env.example)
├── requirements.txt            # Python зависимости
├── database/
│   ├── init.sql               # Схема базы данных (CRM)
│   └── seed_products.sql      # Каталог товаров
├── shared/
│   ├── __init__.py
│   ├── config.py              # Конфигурация (Pydantic Settings)
│   ├── database.py            # Подключение к PostgreSQL
│   ├── ai_engine.py           # Интеграция с OpenAI
│   └── utils.py               # Утилиты (форматирование, эскейпинг)
├── web_office/                # Web Dashboard / CRM FastAPI
│   ├── main.py                # FastAPI приложение
│   ├── templates/             # HTML шаблоны
│   └── static/                # CSS/JS
└── bots/
    ├── __init__.py
    └── sales_bot/             # 🛒 Бот отдела продаж
        ├── __init__.py
        ├── main.py            # Точка входа
        ├── states.py          # FSM состояния
        ├── handlers/
        │   ├── __init__.py
        │   ├── start.py       # /start, /help, приветствие
        │   ├── catalog.py     # Каталог товаров
        │   ├── order.py       # Оформление заказа
        │   ├── my_orders.py   # История заказов
        │   ├── b2b.py         # B2B квалификация
        │   └── ai_chat.py     # AI-чат с менеджером
        └── keyboards/
            └── inline.py      # Inline клавиатуры
```

## 🚀 Быстрый старт

### 1. Клонируйте и настройте

```bash
# Скопируйте шаблон переменных
cp .env.example .env

# Отредактируйте .env — добавьте свои токены
nano .env
```

### 2. Создайте ботов в Telegram

1. Откройте @BotFather в Telegram
2. Отправьте `/newbot`
3. Назовите бота (например: "MG Отдел Продаж")
4. Задайте username (например: `MG_Sales_Bot`)
5. Скопируйте токен в `.env` файл (`SALES_BOT_TOKEN=...`)
6. Повторите для остальных ботов

### 3. Запустите инфраструктуру

```bash
# Запуск PostgreSQL + Redis
docker compose up -d

# Проверьте что всё работает
docker compose ps
```

### 4. Установите Python зависимости

```bash
# Создайте виртуальное окружение
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или
.\venv\Scripts\activate   # Windows

# Установите зависимости
pip install -r requirements.txt
```

### 5. Запустите бота продаж

```bash
python -m bots.sales_bot.main
```

## 🔧 Конфигурация

Все настройки в файле `.env`:

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `SALES_BOT_TOKEN` | Токен бота продаж от @BotFather | `123456:ABC-DEF...` |
| `DATABASE_URL` | Строка подключения к PostgreSQL | `postgresql+asyncpg://...` |
| `REDIS_URL` | Строка подключения к Redis | `redis://localhost:6379/0` |
| `OPENAI_API_KEY` | API ключ OpenAI | `sk-...` |
| `ADMIN_TELEGRAM_IDS` | ID администраторов (через запятую) | `123456789,987654321` |
| `FREE_DELIVERY_THRESHOLD` | Порог бесплатной доставки (UZS) | `500000` |

## 📱 Боты

Telegram-боты (aiogram, FSM + AI-чат):

| # | Бот | Отдел | Модуль | Статус |
|---|-----|-------|--------|--------|
| 1 | Степан | 🤖 Оркестратор / помощник CEO | `bots.stepan_bot.main` | ✅ |
| 2 | Sales Bot | 🛒 Продажи | `bots.sales_bot.main` | ✅ |
| 3 | Support Bot | 🎧 Поддержка | `bots.support_bot.main` | ✅ |
| 4 | Content Bot | ✍️ Контент | `bots.content_bot.main` | ✅ |
| 5 | Finance Bot | 💰 Финансы | `bots.finance_bot.main` | ✅ |
| 6 | HR Bot | 👥 HR | `bots.hr_bot.main` | ✅ |
| 7 | ~~PM Bot~~ | 📋 = Степан | `bots.stepan_bot.main` | ✅ (PM = Степан, один бот) |
| 8 | Analytics Bot | 📊 Аналитика | `bots.analytics_bot.main` | ✅ |
| 9 | Marketing Bot | 📢 Маркетинг | `bots.marketing_bot.main` | ✅ |

Сервисные боты (без своего Telegram-чата — воркеры event bus / n8n webhook):

| Бот | Роль | Модуль |
|-----|------|--------|
| DevOps Bot | 🛠 Бэкапы БД, обслуживание | `bots.devops_bot.main` |
| QA Bot | 🔬 Контроль качества (Vision-анализ фото всходов) | `bots.qa_bot.main` |
| R&D Bot | 🧬 Анализ трендов | `bots.rnd_bot.main` |
| n8n Bridge | 🌉 Мост к n8n (почта / календарь / контакты) | `bots.n8n_bridge.main` |

## 🐳 Запуск всего стека через Docker

```bash
# Поднять все сервисы (Postgres, Redis, web_office и все боты)
docker compose up -d --build

# Применить миграции к уже существующей БД (идемпотентно)
python migrate_v3.py
```

Актуальный список сервисов и портов — в `docker-compose.yml`. Скрипты
`start_all.ps1` / `start_all.bat` запускают ботов локально (Windows) через venv.

## 📞 Контакты

- **Сайт:** https://microgreenuzbekistan.com
- **Telegram:** @MicrogreenUzbekistan
- **Instagram:** @microgreenuzbekistan
- **Телефон:** +998 94 999 95 99
- **Город:** Самарканд, Узбекистан
