'use client';

import { useState } from 'react';
import { Play, Database, RefreshCw, Send, ShieldAlert, BarChart3, Sparkles, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BotActionConfig {
  bot: string;
  name: string;
  action: string;
  description: string;
  icon: any;
  btnColor: string;
}

const BOT_ACTIONS: BotActionConfig[] = [
  {
    bot: 'devops_bot',
    name: 'DevOpsBot',
    action: 'daily_backup',
    description: 'Мгновенный бекап базы данных PostgreSQL в резервное хранилище.',
    icon: Database,
    btnColor: 'bg-emerald-600 hover:bg-emerald-500',
  },
  {
    bot: 'analytics_bot',
    name: 'AnalyticsBot',
    action: 'daily_kpi_snapshot',
    description: 'Запуск расчёта ежедневного снимка KPI (Выручка, Чеки, Лиды) и отправка в Telegram.',
    icon: BarChart3,
    btnColor: 'bg-blue-600 hover:bg-blue-500',
  },
  {
    bot: 'content_bot',
    name: 'ContentBot',
    action: 'sync_publication_metrics',
    description: 'Синхронизация лайков/охватов постов из Instagram API и публикация отчёта.',
    icon: FileText,
    btnColor: 'bg-purple-600 hover:bg-purple-500',
  },
  {
    bot: 'web_office',
    name: 'WebOffice',
    action: 'sync_catalog_from_storefront',
    description: 'Принудительный синк товаров и категорий между витриной и CRM.',
    icon: RefreshCw,
    btnColor: 'bg-teal-600 hover:bg-teal-500',
  },
  {
    bot: 'stepan_bot',
    name: 'StepanBot (CEO)',
    action: 'force_learning_cycle',
    description: 'Принудительный запуск круга рассуждений и совещания отделов.',
    icon: Sparkles,
    btnColor: 'bg-amber-600 hover:bg-amber-500',
  },
  {
    bot: 'marketing_bot',
    name: 'MarketingBot',
    action: 'trigger_lead_audit',
    description: 'Аудит эффективности маркетинговых каналов и конверсии лидов.',
    icon: Send,
    btnColor: 'bg-pink-600 hover:bg-pink-500',
  },
];

type ResultStatus = 'ok' | 'pending' | 'error';

/** Показать то, что вернул бот, а не голое «успешно». */
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

  // Раньше здесь всегда выставлялся status:'ok' — даже когда запрос падал,
  // а сам эндпоинт в ИИ-офисе отсутствовал. Кнопки рапортовали об успехе,
  // не сделав ничего. Теперь показываем настоящий исход.
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
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 bg-gradient-to-r from-amber-900/40 via-orange-900/30 to-red-900/40 border border-amber-500/20 rounded-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-amber-400 font-semibold mb-1">
          <Sparkles size={22} className="animate-pulse" />
          <span>{lang === 'ru' ? 'Пульт Управления ИИ-Офисом и Командами' : 'AI Office Boshqaruv Pult'}</span>
        </div>
        <h2 className="text-2xl font-bold text-white">
          {lang === 'ru' ? 'Мгновенный запуск задач и функций 11 Ботов' : '11 Botlar Buyruqlarini Bajarish'}
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          {lang === 'ru'
            ? 'Прямой запуск бекапов, отчетов, синхронизаций и петель обучения в один клик из админки.'
            : 'Zahiraviy nusxa, hisobot va sinxronizatsiyani bir bosishda ishga tushirish.'}
        </p>
      </div>

      {/* Result Toast Alert */}
      {lastResult && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
            lastResult.status === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : lastResult.status === 'pending'
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          {lastResult.status === 'ok'
            ? <CheckCircle2 size={20} />
            : lastResult.status === 'pending'
              ? <RefreshCw size={20} />
              : <AlertTriangle size={20} />}
          <div>
            <div className="font-bold text-sm">[{lastResult.action}]</div>
            <div className="text-xs">{lastResult.message}</div>
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
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between shadow-lg"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 bg-slate-800 text-amber-400 rounded-xl">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{item.name}</h3>
                    <span className="text-xs font-mono text-slate-500">{item.action}</span>
                  </div>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">{item.description}</p>
              </div>

              <button
                onClick={() => triggerAction(item)}
                disabled={isRunning}
                className={`w-full py-2.5 px-4 text-white text-sm font-medium rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 ${item.btnColor}`}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Выполнение...</span>
                  </>
                ) : (
                  <>
                    <Play size={16} />
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
