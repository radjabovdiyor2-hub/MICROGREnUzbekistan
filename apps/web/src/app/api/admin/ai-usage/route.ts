import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { getNumber } from '@/lib/settings/store';

// ══════════════════════════════════════════════════════════════════════
// Расходы на ИИ.
//
// Таблица ai_usage наполнялась с самого начала, но увидеть её было негде:
// бюджеты AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD задавались в .env и
// работали только как порог алерта в Telegram. Сколько именно съел каждый
// бот, владелец не знал.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days')) || 30, 1), 180);
  const from = new Date();
  from.setDate(from.getDate() - days);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [byBot, todayAgg, monthAgg, recent, dailyBudget, monthlyBudget, usdRate] = await Promise.all([
    prisma.aiUsage.groupBy({
      by: ['bot'],
      where: { createdAt: { gte: from } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfToday } }, _sum: { costUsd: true } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { costUsd: true } }),
    prisma.aiUsage.findMany({ orderBy: { id: 'desc' }, take: 50 }),
    getNumber('ai.dailyBudgetUsd'),
    getNumber('ai.monthlyBudgetUsd'),
    getNumber('ai.usdUzsRate'),
  ]);

  const todayUsd = Number(todayAgg._sum.costUsd ?? 0);
  const monthUsd = Number(monthAgg._sum.costUsd ?? 0);

  return NextResponse.json({
    status: 'ok',
    period: { days },
    budget: {
      dailyUsd: dailyBudget,
      monthlyUsd: monthlyBudget,
      todayUsd,
      monthUsd,
      // Бюджет — это сигнал, а не жёсткий стоп: боты не перестают работать
      // при превышении. Показываем процент, чтобы владелец решал сам.
      todayPct: dailyBudget > 0 ? Math.round((todayUsd / dailyBudget) * 100) : 0,
      monthPct: monthlyBudget > 0 ? Math.round((monthUsd / monthlyBudget) * 100) : 0,
      monthUzs: Math.round(monthUsd * usdRate),
    },
    byBot: byBot
      .map(b => ({
        bot: b.bot,
        costUsd: Number(b._sum.costUsd ?? 0),
        inputTokens: b._sum.inputTokens ?? 0,
        outputTokens: b._sum.outputTokens ?? 0,
        calls: b._count._all,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    recent: recent.map(r => ({
      id: String(r.id),
      bot: r.bot,
      provider: r.provider,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: Number(r.costUsd),
      createdAt: r.createdAt,
    })),
  });
}
