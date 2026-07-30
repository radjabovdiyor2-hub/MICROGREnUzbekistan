# Runbook — эксплуатация без владельца

Документ отвечает на один вопрос: **что делать, если Диёра нет на связи** —
отпуск, болезнь, потеря телефона. Всё, что здесь описано, должно быть
выполнимо вторым человеком без доступа к личным устройствам владельца.

> Связанные документы: [SECURITY.md](SECURITY.md) — модель угроз и секреты,
> [DEPLOY.md](DEPLOY.md) — развёртывание, [ARCHITECTURE.md](ARCHITECTURE.md) —
> схемы и границы модулей.

---

## 1. Подготовка (сделать ДО отпуска)

Без этих четырёх пунктов остальной документ бесполезен.

| # | Действие | Проверка, что сделано |
|---|----------|----------------------|
| 1 | Добавить второго администратора в `ADMIN_TELEGRAM_IDS` (через запятую) | Прислать себе тестовый алерт, убедиться, что пришёл обоим |
| 2 | Задать `BACKUP_REMOTE_TARGET` и `BACKUP_SSH_KEY` — внешнее хранилище бэкапов | `ls` на удалённой стороне показывает свежий дамп |
| 3 | Передать доверенному лицу доступ к менеджеру паролей с `.env` | Он самостоятельно открывает `ADMIN_PASSWORD` |
| 4 | Провести учебное восстановление (раздел 5) | Дамп разворачивается в тестовую базу без ошибок |

Проверка №4 — не формальность. Бэкап, который никогда не восстанавливали,
следует считать несуществующим.

---

## 2. Кто что может

| Роль | Как получает доступ | Что может | Как отозвать |
|------|--------------------|-----------|--------------|
| Владелец (`ADMIN`) | пароль на `/admin` | всё | сменить `ADMIN_PASSWORD`, рестарт `web` |
| Продавец (`SELLER`) | 4-значный PIN на `/admin` | касса, движения склада | `isActive=false` у сотрудника |
| Сервисы (боты, cron) | `BOT_SECRET` в заголовке | admin-API без интерфейса | сменить `BOT_SECRET` во всех `.env` |

Сессия живёт 12 часов, лежит в httpOnly-cookie `mg_session`. Смена
`SESSION_SECRET` мгновенно разлогинивает всех — это аварийный рубильник.

**Выдать доступ заместителю на время отпуска:** завести его как сотрудника
с ролью `manager` (Админка → Сотрудники) и отдать PIN. Полный пароль
владельца передавать не нужно. После отпуска — деактивировать.

---

## 3. Дежурство и алерты

Алерты приходят **всем** из `ADMIN_TELEGRAM_IDS` (это изменение внесено
специально: раньше уходило только первому в списке).

| Алерт | Что означает | Первое действие |
|-------|--------------|-----------------|
| `🚨 АЛЕРТ: боты не отвечают` | heartbeat молчит > 5 мин | раздел 4.1 |
| `🚨 Бэкап БД НЕ создан` | pg_dump упал | проверить место: `df -h` |
| `🚨 Бэкап повреждён` | дамп без маркера завершения | почти всегда — кончился диск |
| `⚠️ Бэкап не уехал наружу` | rsync не прошёл | проверить SSH-ключ и доступность хоста |
| `WebDown` (Prometheus) | сайт не отвечает 2 мин | раздел 4.2 |
| `DiskAlmostFull` | занято > 95% | раздел 4.3 |
| `BruteForceAttempt` | > 30 неудачных входов за 10 мин | раздел 4.4 |

Grafana и Prometheus слушают только loopback. Доступ — через SSH-туннель:

```bash
ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 ubuntu@<server>
# затем http://localhost:3001 (Grafana), http://localhost:9090 (Prometheus)
```

---

## 4. Типовые аварии

### 4.1 Бот не отвечает

```bash
cd /opt/microgreen
docker compose -f docker-compose.prod.yml ps            # кто упал
docker compose -f docker-compose.prod.yml logs --tail=100 <сервис>
docker compose -f docker-compose.prod.yml restart <сервис>
```

Если после рестарта падает снова — смотреть логи на предмет исчерпания
токенов AI-провайдера или недоступности БД. Не пересобирать образ вслепую.

### 4.2 Сайт не открывается

```bash
curl -s localhost:3002/api/health?ready=1 | jq   # приложение и БД
docker compose -f docker-compose.prod.yml logs --tail=100 web
sudo nginx -t && sudo systemctl reload nginx     # если проблема на краю
```

`"status": "degraded"` в ответе означает, что приложение живо, но не видит
PostgreSQL — идти в раздел 4.3, чаще всего это диск.

### 4.3 Кончается место

```bash
df -h
docker image prune -af            # безопасно: образы пересоберутся
docker system df                  # что именно занимает
ls -lh apps/tgas/backups/         # хранится 7 дампов
```

PostgreSQL при заполнении диска перестаёт принимать запись — сайт при этом
может продолжать отдавать страницы, поэтому дожидаться жалоб покупателей не
надо, реагировать по алерту.

### 4.4 Подбор пароля или PIN

Лимиты уже режут перебор (10 попыток/15 мин на пароль, 5 — на PIN), поэтому
алерт означает «кто-то пробует», а не «кто-то вошёл». Проверить, был ли
успешный вход:

```bash
grep '"action":"login.success"' logs/audit-$(date +%F).jsonl
grep '"action":"pin.success"'  logs/audit-$(date +%F).jsonl
```

Если успешный вход есть и он не ваш — сменить `ADMIN_PASSWORD` и
`SESSION_SECRET`, перезапустить `web` (это разлогинит всех).

### 4.5 Утечка секрета

Порядок — в [SECURITY.md](SECURITY.md), раздел «Реагирование на инциденты».
Коротко: отозвать ключ у провайдера → заменить в `.env` на сервере →
`docker compose up -d` затронутых сервисов → проверить журнал аудита.

---

## 5. Восстановление базы из бэкапа

Бэкапы: ежедневно в 03:00, 7 последних в `apps/tgas/backups/`, копия на
внешнем хранилище (`BACKUP_REMOTE_TARGET`).

**Учебное восстановление** (безопасно, на рабочей системе не сказывается):

```bash
# 1. Поднять временную базу рядом
docker run -d --name mg_restore_test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=restore_test -p 127.0.0.1:5433:5432 pgvector/pgvector:pg16

# 2. Развернуть в неё последний дамп
LATEST=$(ls -t apps/tgas/backups/tgas_backup_*.sql | head -1)
docker exec -i mg_restore_test psql -U postgres -d restore_test < "$LATEST"

# 3. Убедиться, что данные на месте
docker exec mg_restore_test psql -U postgres -d restore_test \
  -c "SELECT count(*) FROM customers; SELECT count(*) FROM orders;"

# 4. Убрать за собой
docker rm -f mg_restore_test
```

**Боевое восстановление** — только когда рабочая база потеряна:

```bash
docker compose -f docker-compose.prod.yml stop web web_office stepan sales support \
  hr finance marketing analytics content qa rnd devops n8n_bridge
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U mg_user -d microgreen < apps/tgas/backups/<файл>.sql
docker compose -f docker-compose.prod.yml start web web_office stepan sales support \
  hr finance marketing analytics content qa rnd devops n8n_bridge
```

Останавливать сервисы обязательно: восстановление при активной записи даёт
противоречивое состояние.

---

## 6. Деплой

Автоматический: push в `main` → GitHub Actions прогоняет lint, типы, тесты,
секрет-скан и аудит зависимостей, затем деплоит по SSH.

Ручной, если CI недоступен:

```bash
cd /opt/microgreen
git fetch origin && git reset --hard origin/main
./deploy.sh web            # только сайт
./deploy.sh                # всё
```

**Откат** на предыдущий рабочий коммит:

```bash
git log --oneline -10
git reset --hard <хеш>
./deploy.sh
```

---

## 7. Что НЕ делать без владельца

Эти действия необратимы или затрагивают деньги — дождаться связи:

- менять цены и остатки массово (разовые правки — можно);
- трогать ключи Click/Payme и настройки платёжных webhook'ов;
- удалять пользователей и заказы (для запросов на удаление персональных
  данных есть штатный маршрут `/api/users/data`);
- `git push --force` в `main`;
- пересоздавать том PostgreSQL (`docker compose down -v` — **удаляет базу**).

---

## 8. Контакты

| Кому | Когда | Как |
|------|-------|-----|
| Диёр Раджабов (владелец) | всё, что в разделе 7 | Telegram @Rd2445, +998 94 999 95 99 |
| Второй администратор | штатные аварии | указать при заполнении п.1 раздела 1 |
| Хостинг VPS | сервер недоступен целиком | панель провайдера |

---

## 9. Обязательная ротация после утечки (июль 2026)

Старые пароли и токены попали в git-историю, пока репо было публичным.
Очистка HEAD не помогает — история компрометирует навсегда.

**Чеклист (выполнить на сервере по SSH):**

```bash
# 1. Сменить пароль системного пользователя
passwd ubuntu

# 2. Перейти на SSH-ключи, отключить парольный вход
# В /etc/ssh/sshd_config:
#   PasswordAuthentication no
#   PubkeyAuthentication yes
sudo nano /etc/ssh/sshd_config
sudo systemctl restart sshd

# 3. Ревизовать authorized_keys
cat ~/.ssh/authorized_keys
# Оставить только свой ключ + ключ CI (GitHub Actions)

# 4. Ротировать Telegram Bot Token
# BotFather → /revoke → выпустить новый → обновить в .env → рестарт ботов
nano /opt/microgreen/.env
# Обновить TELEGRAM_BOT_TOKEN=<новый>
cd /opt/microgreen && docker compose -f docker-compose.prod.yml restart web
cd /opt/microgreen && docker compose -f docker-compose.prod.yml up -d --build \
  stepan sales support hr finance marketing analytics content qa rnd devops n8n_bridge

# 5. Ротировать Instagram/Facebook токены (если используются)
# Обновить INSTAGRAM_TOKEN, FACEBOOK_TOKEN в .env

# 6. N8N: включить аутентификацию (если N8N запущен на хосте)
# В конфиге N8N:
#   N8N_BASIC_AUTH_ACTIVE=true
#   N8N_BASIC_AUTH_USER=admin
#   N8N_BASIC_AUTH_PASSWORD=<сильный пароль>
# Или закрыть порт 5678 через iptables/nginx
```

**Проверка:**
- `ssh ubuntu@сервер` — старый пароль не работает
- `curl http://сервер:5678` — требует Basic Auth или не отвечает
- отправить `/start` боту — бот работает с новым токеном

