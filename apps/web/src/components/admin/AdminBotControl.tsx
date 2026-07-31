'use client';

import { useState } from 'react';
import { Play, Database, RefreshCw, Send, BarChart3, Sparkles, FileText, CheckCircle2, AlertTriangle, Zap, Cpu } from 'lucide-react';

interface BotActionConfig {
  bot: string;
  name: string;
  action: string;
  description: string;
  icon: any;
  btnGradient: string;
  badgeStyle: string;
  iconColor: string;
}

const BOT_ACTIONS: BotActionConfig[] = [
  {
    bot: 'devops_bot',
    name: 'DevOpsBot',
    action: 'daily_backup',
    description: 'Мгновенный бекап базы данных PostgreSQL в резервное хранилище.',
    icon: Database,
    btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    badgeStyle: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    iconColor: 'text-emerald-400',
  },
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'daily_kpi_snapshot',
    description: 'Запуск расчёта ежедневного снимка KPI (Выручка, Чеки, Лиды) и отправка в Telegram.',
    icon: BarChart3,
    btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    badgeStyle: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    iconColor: 'text-emerald-400',
  },
  {
    bot: 'content_bot',
    name: 'ContentBot',
    action: 'sync_publication_metrics',
    description: 'Синхронизация лайков/охватов постов из Instagram API и публикация отчёта.',
    icon: FileText,
    btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    badgeStyle: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    iconColor: 'text-emerald-400',
  },
  {
    bot: 'web_office',
    name: 'WebOffice',
    action: 'sync_catalog_from_storefront',
    description: 'Принудительный синк товаров и категорий между витриной и CRM.',
    icon: RefreshCw,
    btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    badgeStyle: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    iconColor: 'text-emerald-400',
  },
  {
    bot: 'stepan_bot',
    name: 'StepanBot (CEO)',
    action: 'force_learning_cycle',
    description: 'Принудительный запуск круга рассуждений и совещания отделов.',
    icon: Sparkles,
    btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    badgeStyle: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    iconColor: 'text-amber-400',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'trigger_lead_audit',
    description: 'Аудит эффективности маркетинговых каналов и конверсии лидов.',
    icon: Send,
    btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30',
    badgeStyle: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    iconColor: 'text-emerald-400',
  },
];

type ResultStatus = 'ok' | 'pending' | 'error';

function describeResult(data: any): string {
  const payload = data?.result;
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    if (typeof payload.message === 'string') return payload.message;
    try { return JSON.stringify(payload); } catch { return ''; }
  }
  return String(payload);
}

export function AdminBotControl({ lang }: { lang: 'ru' | 'uz' }) {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ action: string; status: ResultStatus; message: string } | null>(null);

  const triggerAction = async (item: BotActionConfig) => {
    setRunningAction(item.action);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/bot-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: item.action, bot: item.bot }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.status === 'error') {
        setLastResult({
          action: item.name,
          status: 'error',
          message: data.error || `Ошибка ${res.status}`,
        });
      } else if (data.status === 'pending') {
        setLastResult({
          action: item.name,
          status: 'pending',
          message: data.message || 'Задача в очереди, бот пока не ответил.',
        });
      } else {
        const detail = describeResult(data);
        setLastResult({
          action: item.name,
          status: 'ok',
          message: detail
            ? `Выполнено: ${detail}`
            : `${item.action} выполнено ботом ${data.bot || item.name}.`,
        });
      }
    } catch (err: any) {
      setLastResult({
        action: item.name,
        status: 'error',
        message: err?.message || 'Сеть недоступна',
      });
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Brand Header Banner */}
      <div className="relative overflow-hidden p-6 md:p-8 rounded-3xl border border-[var(--brand-primary)]/30 bg-gradient-to-r from-emerald-950/80 via-[var(--bg-card)] to-teal-950/80 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-12 -top-12 w-56 h-56 bg-[var(--brand-primary)]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30 text-[var(--brand-primary)] text-xs font-semibold tracking-wide mb-3">
            <Sparkles size={14} className="animate-pulse text-[var(--brand-primary)]" />
            <span>{lang === 'ru' ? 'Пульт Управления ИИ-Офисом и Командами' : 'AI Office Boshqaruv Pult'}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight font-display">
            {lang === 'ru' ? 'Мгновенный запуск задач и функций 11 Ботов' : '11 Botlar Buyruqlarini Bajarish'}
          </h2>
          <p className="text-[var(--text-secondary)] text-sm md:text-base leading-relaxed mt-2 max-w-3xl">
            {lang === 'ru'
              ? 'Прямой запуск бекапов, отчётов, синхронизаций и петель обучения в один клик из центральной админки.'
              : 'Zahiraviy nusxa, hisobot va sinxronizatsiyani bir bosishda ishga tushirish.'}
          </p>
        </div>
      </div>

      {/* Result Toast Alert */}
      {lastResult && (
        <div
          className={`p-4 md:p-5 rounded-2xl border flex items-start gap-4 transition-all duration-300 shadow-xl backdrop-blur-xl ${
            lastResult.status === 'ok'
              ? 'bg-[var(--success-bg)] border-[var(--success)]/40 text-[var(--success)]'
              : lastResult.status === 'pending'
                ? 'bg-[var(--warning-bg)] border-[var(--warning)]/40 text-[var(--warning)]'
                : 'bg-[var(--error-bg)] border-[var(--error)]/40 text-[var(--error)]'
          }`}
        >
          {lastResult.status === 'ok'
            ? <CheckCircle2 size={22} className="shrink-0 mt-0.5" />
            : lastResult.status === 'pending'
              ? <RefreshCw size={22} className="animate-spin shrink-0 mt-0.5" />
              : <AlertTriangle size={22} className="shrink-0 mt-0.5" />}
          <div>
            <div className="font-bold text-sm md:text-base flex items-center gap-2">
              <span>[{lastResult.action}]</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-black/40 font-mono">
                {lastResult.status.toUpperCase()}
              </span>
            </div>
            <div className="text-xs md:text-sm text-[var(--text-secondary)] mt-1">{lastResult.message}</div>
          </div>
        </div>
      )}

      {/* Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {BOT_ACTIONS.map((item) => {
          const Icon = item.icon;
          const isRunning = runningAction === item.action;
          return (
            <div
              key={item.action}
              className="group relative bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--brand-primary)]/50 rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 shadow-lg hover:shadow-2xl backdrop-blur-xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 from-transparent via-[var(--brand-primary)] to-transparent" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl border ${item.badgeStyle}`}>
                      <Icon size={22} className={item.iconColor} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--text-primary)] text-lg tracking-tight group-hover:text-[var(--brand-primary)] transition-colors font-display">
                        {item.name}
                      </h3>
                      <span className="text-xs font-mono text-[var(--text-muted)] block mt-0.5">
                        {item.action}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[var(--text-secondary)] text-xs md:text-sm leading-relaxed mb-6 font-normal">
                  {item.description}
                </p>
              </div>

              <button
                onClick={() => triggerAction(item)}
                disabled={isRunning}
                className={`w-full py-3 px-4 text-sm font-semibold rounded-xl transition-all duration-300 shadow-lg flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-95 ${item.btnGradient}`}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={18} className="animate-spin text-white" />
                    <span>Выполнение...</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} className="text-white fill-white/20" />
                    <span>Запустить Задачу</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
