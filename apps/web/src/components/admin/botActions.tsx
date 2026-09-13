// Реестр действий пульта ИИ-офиса: что можно запустить и у какого бота.
// Вынесено из AdminBotControl — чистые данные без состояния.

export interface BotActionConfig {
  bot: string;
  name: string;
  action: string;
  description: { ru: string; uz: string };
  icon: typeof Database;
  color: string;
}

import {
  BarChart3, BookOpen, Database, FileText, Landmark, RefreshCw,
  Send, Sparkles, Star, TrendingUp,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ
//
// Белый список офиса (`ADMIN_BOT_ACTIONS` в web_office/main.py) шире этого
// реестра на три действия, и они не выведены НАМЕРЕННО:
//
//   · `send_broadcast` — уходит сразу всей базе клиентов, без карточки
//     подтверждения (`bus_send_broadcast` рассылает по факту вызова).
//     Кнопка «в один клик» рядом с «Бекап БД» — это рассылка по промаху
//     пальцем, которую нечем отозвать.
//   · `publish_post` / `publish_story` — публикуют в Instagram немедленно.
//     Без текста бот сочинит его сам и выложит; вышедший пост не отзывается.
//
// Все три требуют содержимого (текст рассылки, текст поста), то есть формы,
// а не кнопки. Пока формы нет, честнее не обещать действие вовсе: кнопка,
// которая всегда отвечает «текст рассылки пуст», хуже отсутствующей.
//
// Правило проекта то же самое: у клиентских и публикующих действий порога
// самостоятельности быть не должно (apps/tgas/CLAUDE.md).
// ══════════════════════════════════════════════════════════════════════


export const BOT_ACTIONS: BotActionConfig[] = [
  {
    bot: 'devops_bot',
    name: 'DevOpsBot',
    action: 'daily_backup',
    description: { ru: 'Мгновенный бекап базы данных PostgreSQL в резервное хранилище.', uz: "PostgreSQL bazasini zaxira omboriga bir zumda nusxalash." },
    icon: Database,
    color: 'var(--brand-primary)',
  },
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'daily_kpi_snapshot',
    description: { ru: 'Запуск расчёта ежедневного снимка KPI (Выручка, Чеки, Лиды) и отправка в Telegram.', uz: "Kunlik KPI kesimini (tushum, cheklar, lidlar) hisoblab, Telegramga yuborish." },
    icon: BarChart3,
    color: 'var(--info)',
  },
  {
    bot: 'content_bot',
    name: 'ContentBot',
    action: 'sync_publication_metrics',
    description: { ru: 'Синхронизация лайков/охватов постов из Instagram API и публикация отчёта.', uz: "Instagram API dan layk va qamrovlarni sinxronlab, hisobotni chiqarish." },
    icon: FileText,
    color: 'var(--cat-2)',
  },
  {
    bot: 'sales_bot',
    name: 'SalesBot',
    action: 'sync_catalog_from_storefront',
    description: { ru: 'Принудительный синк товаров и категорий между витриной и CRM.', uz: "Do'kon va CRM o'rtasida mahsulot va kategoriyalarni majburiy sinxronlash." },
    icon: RefreshCw,
    color: 'var(--cat-4)',
  },
  {
    bot: 'stepan_bot',
    name: 'StepanBot (CEO)',
    action: 'force_learning_cycle',
    description: { ru: 'Принудительный запуск круга рассуждений и совещания отделов.', uz: "Mulohaza doirasi va bo'limlar yig'ilishini majburiy ishga tushirish." },
    icon: Sparkles,
    color: 'var(--brand-accent)',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'trigger_lead_audit',
    description: { ru: 'Аудит эффективности маркетинговых каналов и конверсии лидов.', uz: "Marketing kanallari samarasi va lidlar konversiyasi auditi." },
    icon: Send,
    color: 'var(--cat-3)',
  },
  // ── Разрешено офисом, но до сих пор не выведено ────────────────────
  // Девять действий из пятнадцати существовали только в белом списке:
  // запустить их можно было из Telegram словами, а из пульта — нет.
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'get_report',
    description: { ru: 'Сводный отчёт по продажам и заказам за период — в Telegram.', uz: "Davr bo'yicha sotuv va buyurtmalar yig'ma hisoboti — Telegramga." },
    icon: FileText,
    color: 'var(--info)',
  },
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'get_top_products',
    description: { ru: 'Лучшие товары по выручке: что вытягивает месяц, а что лежит.', uz: "Tushum bo'yicha eng yaxshi mahsulotlar: oyni kim tortadi, nima yotibdi." },
    icon: TrendingUp,
    color: 'var(--cat-5)',
  },
  {
    bot: 'finance_bot',
    name: 'FinanceBot',
    action: 'get_balance',
    description: { ru: 'Баланс и P&L на сегодня: доход, расход, прибыль, маржа.', uz: "Bugungi balans va P&L: daromad, xarajat, foyda, marja." },
    icon: Landmark,
    color: 'var(--success)',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'pick_restaurant_of_week',
    description: { ru: 'Выбрать «Ресторан недели» для рубрики журнала и сторис.', uz: "Jurnal rukni va storis uchun «Hafta restorani»ni tanlash." },
    icon: Star,
    color: 'var(--brand-accent)',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'b2b_outreach',
    description: { ru: 'Подготовить коммерческие предложения B2B-лидам. Письма уйдут только после вашего одобрения.', uz: "B2B lidlarga tijorat takliflarini tayyorlash. Xatlar faqat siz tasdiqlaganingizdan keyin ketadi." },
    icon: Send,
    color: 'var(--cat-3)',
  },
  {
    bot: 'content_bot',
    name: 'ContentBot',
    action: 'draft_magazine',
    description: { ru: 'Собрать черновик выпуска журнала FRESH WEEKLY. Публикация — отдельным решением.', uz: "FRESH WEEKLY jurnali sonining qoralamasini yig'ish. Nashr — alohida qaror bilan." },
    icon: BookOpen,
    color: 'var(--cat-2)',
  },
];

export type ResultStatus = 'ok' | 'pending' | 'error';

export function describeResult(data: Record<string, unknown>): string {
  const payload = data?.result;
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p.message === 'string') return p.message;
    try { return JSON.stringify(payload); } catch { return ''; }
  }
  return String(payload);
}
