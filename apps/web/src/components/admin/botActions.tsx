// Реестр действий пульта ИИ-офиса: что можно запустить и у какого бота.
// Вынесено из AdminBotControl — чистые данные без состояния.

export interface BotActionConfig {
  bot: string;
  name: string;
  action: string;
  description: string;
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
    description: 'Мгновенный бекап базы данных PostgreSQL в резервное хранилище.',
    icon: Database,
    color: 'var(--brand-primary)',
  },
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'daily_kpi_snapshot',
    description: 'Запуск расчёта ежедневного снимка KPI (Выручка, Чеки, Лиды) и отправка в Telegram.',
    icon: BarChart3,
    color: 'var(--info)',
  },
  {
    bot: 'content_bot',
    name: 'ContentBot',
    action: 'sync_publication_metrics',
    description: 'Синхронизация лайков/охватов постов из Instagram API и публикация отчёта.',
    icon: FileText,
    color: 'var(--cat-2)',
  },
  {
    bot: 'sales_bot',
    name: 'SalesBot',
    action: 'sync_catalog_from_storefront',
    description: 'Принудительный синк товаров и категорий между витриной и CRM.',
    icon: RefreshCw,
    color: 'var(--cat-4)',
  },
  {
    bot: 'stepan_bot',
    name: 'StepanBot (CEO)',
    action: 'force_learning_cycle',
    description: 'Принудительный запуск круга рассуждений и совещания отделов.',
    icon: Sparkles,
    color: 'var(--brand-accent)',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'trigger_lead_audit',
    description: 'Аудит эффективности маркетинговых каналов и конверсии лидов.',
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
    description: 'Сводный отчёт по продажам и заказам за период — в Telegram.',
    icon: FileText,
    color: 'var(--info)',
  },
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'get_top_products',
    description: 'Лучшие товары по выручке: что вытягивает месяц, а что лежит.',
    icon: TrendingUp,
    color: 'var(--cat-5)',
  },
  {
    bot: 'finance_bot',
    name: 'FinanceBot',
    action: 'get_balance',
    description: 'Баланс и P&L на сегодня: доход, расход, прибыль, маржа.',
    icon: Landmark,
    color: 'var(--success)',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'pick_restaurant_of_week',
    description: 'Выбрать «Ресторан недели» для рубрики журнала и сторис.',
    icon: Star,
    color: 'var(--brand-accent)',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'b2b_outreach',
    description: 'Подготовить коммерческие предложения B2B-лидам. Письма уйдут только после вашего одобрения.',
    icon: Send,
    color: 'var(--cat-3)',
  },
  {
    bot: 'content_bot',
    name: 'ContentBot',
    action: 'draft_magazine',
    description: 'Собрать черновик выпуска журнала FRESH WEEKLY. Публикация — отдельным решением.',
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
