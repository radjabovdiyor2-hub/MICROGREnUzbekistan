import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Health-check веб-приложения (DD §4.8).
//
// Нужен и балансировщику, и мониторингу: у ботов heartbeat есть, а у сайта
// проверялась только отдача HTML — то есть «жив» он был и с отвалившейся
// базой, пока страница отдавалась из кеша.
//
// GET /api/health        — liveness: процесс отвечает
// GET /api/health?ready=1 — readiness: плюс живое соединение с БД
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const checkDb = url.searchParams.get('ready') !== null;

  const body: Record<string, unknown> = {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };

  if (!checkDb) return NextResponse.json(body);

  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    body.database = { status: 'ok', latencyMs: Date.now() - started };
    return NextResponse.json(body);
  } catch (error) {
    body.status = 'degraded';
    body.database = {
      status: 'error',
      latencyMs: Date.now() - started,
      // Текст ошибки наружу не отдаём — в нём бывает строка подключения.
      error: 'unreachable',
    };
    console.error('[health] database check failed:', error);
    return NextResponse.json(body, { status: 503 });
  }
}
