# Texnik Due Diligence — Startap tomonidan to'ldiriladigan forma

Loyiha: **Microgreen Uzbekistan**
Sana: 2026-07-29

---

## 1. Umumiy ma'lumot

| Savol | Javob |
|---|---|
| Startap nomi: | Microgreen Uzbekistan |
| CEO (FISH): | Radjabov Diyor |
| CTO (FISH): | Radjabov Diyor (CEO/CTO — bir kishi, AI-agentlar yordamida ishlab chiqadi) |
| Jamoa a'zolari: | 1 asoschi-dasturchi + 13 ta AI-agent (bots: sales, content, support, analytics, HR, devops, copywriter, designer, marketer, PM-Stepan, QA, finance, smm) |
| Bog'lanish uchun kontaktlar: | +998 94 999 95 99, Telegram: @microgreen_uz, https://microgreenuzbekistan.com |

---

## 2. Jamoa

| Savol | Javob |
|---|---|
| Jamoa tarkibi qanday? | Solo-founder + AI-first jamoasi. Asoschi — to'liq stack dasturchi (Next.js, Python, DevOps). 13 ta mustaqil AI-bot (aiogram 3 + Gemini/GPT) turli vazifalarni bajaradi: savdo, kontentni yaratish, mijozlarni qo'llab-quvvatlash, HR, DevOps, moliya, analytics. Har bir bot o'z sohasida ixtisoslashgan va event-bus orqali boshqalar bilan bog'lanadi. |

### 3. Hujjatlashtirish

| # | Hujjat turi | Fayl / havola |
|---|---|---|
| 1 | Infratuzilma va arxitektura diagrammalari | `ARCHITECTURE.md` — 5 ta Mermaid diagramma: infratuzilma va tarmoq chegaralari, kirish modeli, to'lov ketma-ketligi, AI-agentlar o'zaro ta'siri, ER-sxema. GitHub'da avtomatik renderlanadi |
| 2 | API-hujjat (Swagger, Postman) | `docs/openapi.yaml` — OpenAPI 3.1 kontrakti: kirish sxemalari, javob kodlari, limitlar. Postman'ga import qilinadi, `npx @redocly/cli lint` bilan tekshiriladi |
| 3 | DevOps / IaC hujjatlar | `DEPLOY.md` (deploy qo'llanma), `RUNBOOK.md` (operatsion qo'llanma), `docker-compose.prod.yml` (deklarativ infra), `docker-compose.monitoring.yml`, `deploy/monitoring/`, `nginx/` |
| 4 | Ma'lumotlar bazasi | `DATABASE.md`, `packages/database/prisma/schema.prisma`, `apps/tgas/database/init.sql` |
| 5 | Xavfsizlik | `SECURITY.md`, `.gitleaks.toml` (secret scan) |
| 6 | Masshtablash | `SCALABILITY.md` (15 mln foydalanuvchigacha sig'im rejasi + k6 yuk testi stsenariysi) |
| 7 | Yo'l xaritasi | `ROADMAP.md` |

---

## 4. Arxitektura va texnologiyalar

| # | Texnologik mezonlar | Startap loyihadagi holat |
|---|---|---|
| 1 | Ishlab chiqish | Gibrid: asoschi (CEO/CTO) + AI-agentlar (Gemini, GPT). Autsors yo'q. |
| 2 | Backend arxitekturasi | **Event-driven mikroservis**. Web (Next.js 16 API Routes — 23 ta guruh) + AI Office (13 ta mustaqil Python bot, FastAPI). Botlar HTTP Event Bus orqali muloqot qiladi (`X-Bot-Secret` autentifikatsiya). Har bir bot alohida konteynerda ishlaydi. |
| 3 | Front-end | **Next.js 16** (App Router, RSC) + **React 19** + **TypeScript** (strict mode — `tsc --noEmit` 0 xato). PWA (offline qo'llab-quvvatlash). Telegram Mini App (Vite + React). |
| 4 | Ma'lumotlar bazasi | **PostgreSQL 16** (pgvector kengaytmasi — AI uchun vektor qidiruvi). Ikki sxema: `microgreen_db` (Prisma ORM — do'kon) va `microgreen` (SQLAlchemy 2.0 — AI ofis). Atomik tranzaksiyalar (qoldiq, bonuslar, to'lovlar). |
| 5 | Kod qayerda saqlanadi | **GitHub** — `radjabovdiyor2-hub/MICROGREnUzbekistan`. Branch strategiyasi: `main` (prod), feature branches. |
| 6 | Xabarlar brokeri | **Redis Streams + HTTP Event Bus** (o'z ishlanmasi). 13 ta bot o'rtasida hodisalar: `lead.new`, `order.new`, `content.published`, `support.escalated` va boshqalar. Har bir hodisa `X-Bot-Secret` bilan autentifikatsiyadan o'tadi. |
| 7 | Keshlash | **Redis 7** (Alpine) — vaqtinchalik keshlar va Pub/Sub. Rate-limiting: nginx (10 r/s, burst 20) + ilova ichida per-marshrut limitlari (kirish 10/15 min, PIN 5/15 min, AI-chat 20/min, sharhlar 10/soat). |
| 8 | Monitoring | **Prometheus + Grafana** (`docker-compose.monitoring.yml`), node-exporter va cAdvisor. Ilova `/api/metrics` (kirish hisoblagichlari, rad etishlar, biznes ko'rsatkichlar) va `/api/health?ready=1` (liveness + DB tekshiruvi) beradi. 14 ta ogohlantirish qoidasi: mavjudlik, disk, xotira, muvaffaqiyatsiz kirishlar. Barcha portlar — faqat `127.0.0.1`, SSH-tunnel orqali kirish. |
| 9 | Xosting | **VDS** — Ubuntu 24.04 LTS. Docker + Docker Compose. nginx reverse-proxy (TLS/SSL, Let's Encrypt). Domen: `microgreenuzbekistan.com`. |
| 10 | CI/CD | **GitHub Actions**: quality (ESLint, tsc, 64 vitest-test), python-quality (ruff, mypy), security (gitleaks + npm audit), deploy SSH orqali serializatsiya bilan. Deploy barcha tekshiruvlar o'tmaguncha bloklanadi. |
| 11 | Tashqi integratsiyalar | **To'lov tizimlari:** Click (MD5 imzo tekshiruvi), Payme (HTTP Basic, JSON-RPC 2.0). **Telegram Bot API** (13 ta bot). **Google Gemini 2.5 Flash/Pro** va **OpenAI GPT-4o** (AI agentlar). **2GIS Catalog API** (B2B leadlar). Instagram/Facebook API (SMM). |

---

## 5. AI (agar mavjud bo'lsa)

| Savol | Javob |
|---|---|
| Qaysi AI texnologiyalar ishlatiladi? | **Google Gemini 2.5 Flash/Pro**, **OpenAI GPT-4o/4o-mini** — tashqi LLM API orqali. Prompt-engineering, dynamic context injection, RAG (pgvector). O'z modelimiz yo'q — tayyor LLMlarni orkestratsiya qilamiz. |
| Custom model bormi? | Yo'q. Maxsus model o'rgatilmagan va o'rgatilmaydi. Barcha AI — hosted LLM API orqali system prompt + RAG. Bu yondashuv GPU xarajatlarini nolga tushiradi va provayderlar o'rtasida tezda almashish imkonini beradi. |
| Dataset manbasi qanday? | O'rgatish dataseti yo'q (model o'rgatilmaydi). Operativ ma'lumotlar: tovarlar katalogi, B2B restoranlar bazasi, dialog tarixi (`interactions`), FAQ arxivi. RAG uchun — pgvector'dagi vektor embeddinglari. Manbalar: o'z biznes ma'lumotlari + ommaviy manbalar (RSS yangiliklar, trendlar). B2B leadlar — 2GIS Catalog API (ToS bo'yicha). |
| Model sifati qanday baholanadi? | Klassik metrikalar (accuracy/F1) qo'llanilmaydi (model o'rgatilmaydi). Sifat baholanadi: **QA-bot** (javoblarni avtotekshirish), **CSAT-so'rovlar** (n8n webhooklar), **feedback loop** (admin thumbs up/down), **token hisobi** (`ai_usage` jadvali — har bir bot/model bo'yicha sarflangan tokenlar + kunlik hisobot + byudjet ogohlantirishi). |

---

## 6. Xavfsizlik

| # | Xavfsizlik mezonlari | Startap loyihadagi holat |
|---|---|---|
| 1 | Serverlar va infratuzilmani himoyalash | **nginx** reverse-proxy TLS/SSL bilan — yagona tashqi kirish nuqtasi. Docker konteynerlari `mg_net` ichki tarmoqda izolyatsiyalangan. **Postgres (5432), Redis (6379), web_office (8050)** — `127.0.0.1`ga bog'langan, internetdan to'g'ridan-to'g'ri kirish mumkin emas. Event-bus portlari (`808x`) faqat ichki tarmoqda. Loglar: docker `json-file` rotatsiya bilan (10MB x 5). Rate-limiting: nginx 10 r/s + ilova darajasida. |
| 2 | Xavfsiz kodlash (OWASP, Secure Coding) | **Input sanitizatsiya:** JSON-LD'da XSS oldini olish (`lib/seo/jsonLd.ts`), uzunlik cheklash. **Dependency audit:** CI'da `npm audit` + `gitleaks` (butun git tarixi bo'yicha secret scan). **TypeScript strict mode** — kompilyatsiya vaqtida xatolarni aniqlash. `tsc --noEmit` 0 xato. **CSP headerlar**. Qolgan zaifliklar (3 ta `sharp` ichki bog'liqlik) — `SECURITY.md`da ongli ravishda qabul qilingan risk sifatida qayd etilgan. |
| 3 | Foydalanuvchi ma'lumotlari xavfsizligi | Ma'lumotlar faqat **mahalliy serverda** saqlanadi (O'zbekiston). TLS shifrlash tranzitda. PII LLM promptlariga zaruriyatsiz uzatilmaydi. `POST /api/users/data` — foydalanuvchi o'z ma'lumotlarini yuklab olishi va o'chirishi mumkin (Telegram `initData` imzosi bilan tasdiqlash). Buyurtmalar anonimlashtirilib saqlanadi. O'zR «Shaxsiy ma'lumotlar to'g'risida»gi qonunning 20-moddasiga muvofiq. |
| 4 | Kirish darajasi (RBAC, Session, PIN) | **RBAC:** 4 ta rol (`USER`, `ADMIN`, `MODERATOR`, `SELLER`) — `middleware.ts`da yagona shlyuz orqali tekshiriladi. Yangi himoyalangan marshrut avtomatik yopiq. **Sessiya:** HS256 imzolangan token `jose` kutubxonasi bilan, httpOnly cookie (`mg_session`), 12 soat muddat. **Parol:** scrypt + tuz, fail-closed. **POS PIN:** 4 raqamli, 5 urinish/15 min. **Audit log:** kirishlar, rad etishlar, parol o'zgartirish. **2FA/OTP:** hozircha yo'q (halollik bilan). |
| 5 | Qonunchilikka muvofiqlik | O'zR «Shaxsiy ma'lumotlar to'g'risida»gi qonuniga amal qilinadi. Ma'lumotlar O'zbekiston hududidagi serverda saqlanadi. Foydalanuvchi o'z ma'lumotlarini so'rashi va o'chirishni talab qilishi mumkin. |

---

## 7. Jamoaviy boshqaruv va mijozlarni qo'llab-quvvatlash tizimi

| # | Savol | Javob |
|---|---|---|
| 1 | Metodologiya | Moslashuvchan, Kanban-asosida: vazifalar botlar o'rtasida o'z ishlanma bot-bus/event-bus + vizual Kanban-doshbord web_office'da. Dispetcherizatsiya — Stepan (PM-bot). |
| 2 | SDLC | Reja — ishlab chiqish (dasturchi + AI-agentlar) — ko'rib chiqish — yig'ish (`next build`, `py_compile`, `prisma validate`) — deploy (`docker compose up -d --build`) — monitoring. |
| 3 | DevOps vositalari | Docker + Docker Compose (IaC-deklaratsiya), GitHub + GitHub Actions (CI/CD), nginx (TLS), gitleaks (secret-scan), devops-bot (DB backup, konteyner operatsiyalari). |
| 4 | Muhitlar (env) | **dev** (mahalliy, `.env`) va **prod** (VDS, Docker). Staging — o'sish bilan rejalashtirilgan. |
| 5 | Code review va CI | CI majburiy: ESLint, tsc, 64 vitest-test, ruff/mypy, gitleaks, npm audit. Deploy barcha tekshiruvlar o'tmaguncha bloklanadi. Code review — qo'lda (CEO). |
| 6 | Aloqa kanallari | Telegram-botlar (Sales/Support), veb-sayt chat, telefon +998 94 999 95 99, email, Instagram Direct. |
| 7 | Tiket tizimi | O'z ishlanmasi: vazifalar `tasks` jadvalida (Postgres) + Kanban web_office'da; qo'llab-quvvatlash support-bot orqali. |
| 8 | FAQ / qo'llab-quvvatlash | Support-bot bilim bazasi (`scripts/build_knowledge_base.py`), FAQ arxivi, veb-saytdagi ommaviy sahifalar. |

---

## 8. Raqobatchilar

| Savol | Javob |
|---|---|
| Asosiy raqobatchilar kim? | O'zbekistonda to'g'ridan-to'g'ri mikroko'kat raqobatchisi kam. Bilvosita raqobat: an'anaviy sabzavot yetkazib beruvchilari, import qilingan superfoodlar, boshqa fermer xo'jaliklari. |
| Ustunliklaringiz nimada? | **AI-first yondashuv:** 13 ta avtonom AI-bot — raqobatchilar qo'lda ishlaydi. **Telegram-first:** buyurtma, to'lov, qo'llab-quvvatlash — hammasi Telegram ichida. **FRESH WEEKLY jurnali** — har hafta shaxsiylashtirilgan kontent (AR bilan). **B2B avtomatlashtirish:** restoranlar bilan ishlash to'liq avtomatlashtirilgan. |
| Texnologik farqlaringiz? | Raqobatchilar standart veb-sayt + telefon yoki faqat Instagram. Bizda: **event-driven mikroservis**, **13 ta AI-agent** orkestratsiyasi, **RAG** (vektor qidiruvi), **Prometheus/Grafana**, **atomik tranzaksiyalar**, **CI/CD pipeline**. |

### Raqobat tahlili jadvali

| Platforma | Asosiy funksiya | Ustun tomoni | Texnologik farqlari |
|---|---|---|---|
| An'anaviy fermerlar | Mahalliy sabzavot yetkazish | Arzon narx, oddiy logistika | Texnologiya yo'q, telefon/Instagram orqali |
| Import superfood brendlari | Sog'lom oziq-ovqat | Keng assortiment, brend taniqlilik | Standart e-commerce platformalar |
| **Microgreen Uzbekistan** | Mikroko'kat + AI-avtomatlashtirish + B2B | AI-first (13 bot), Telegram-native, shaxsiylashtirilgan jurnal | Event-driven arxitektura, RAG, pgvector, Prometheus/Grafana, CI/CD, atomik tranzaksiyalar |

---

> **Izoh:** Bu hujjat loyihaning haqiqiy holati asosida to'ldirilgan (2026-07-29).
> Ochiq masalalar halollik bilan ko'rsatilgan: 2FA/OTP yo'q, staging muhiti yo'q,
> Face ID o'chirilgan, adversarial testing o'tkazilmagan.
