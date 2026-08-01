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
  BarChart3, Database, FileText, RefreshCw, Send, Sparkles,
} from 'lucide-react';


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
