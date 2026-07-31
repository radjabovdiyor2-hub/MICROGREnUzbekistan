import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { verifyProposal } from '@/lib/stepan/proposal';
import { WRITE_BY_NAME } from '@/lib/stepan/tools';

// ══════════════════════════════════════════════════════════════════════
// Подтверждение действия, предложенного Стёпаном.
//
// Единственное место, где предложение ИИ превращается в изменение
// данных. Требуется подписанный токен из /api/admin/stepan: выполняется
// ровно то, что было показано владельцу, и ничего сверх того.
//
// Каждое выполнение пишется в журнал с actor='stepan' — по нему видно,
// что сделал ИИ, а что руками владелец.
// ══════════════════════════════════════════════════════════════════════

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const token = String(body.token ?? '');
  const proposal = verifyProposal(token);
  if (!proposal) {
    return NextResponse.json(
      { error: 'Предложение недействительно или устарело. Спросите Стёпана заново.' },
      { status: 400 },
    );
  }

  const tool = WRITE_BY_NAME.get(proposal.tool);
  if (!tool) {
    return NextResponse.json({ error: `Неизвестное действие: ${proposal.tool}` }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for') ?? undefined;

  try {
    const result = await tool.execute(proposal.args);

    audit({
      action: `stepan.execute.${proposal.tool}`,
      // actor=stepan, но подтвердил владелец — обе стороны видны в журнале.
      actor: 'stepan',
      role: 'ADMIN',
      ip,
      target: proposal.summary.slice(0, 200),
      meta: {
        args: proposal.args,
        before: proposal.before,
        after: proposal.after,
        confirmedBy: 'owner',
        ok: result.ok,
      },
    });

    return NextResponse.json({
      status: result.ok ? 'ok' : 'error',
      message: result.message,
    }, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error(`[stepan] выполнение ${proposal.tool} упало:`, error);

    audit({
      action: `stepan.execute.${proposal.tool}`,
      actor: 'stepan', role: 'ADMIN', ip,
      target: proposal.summary.slice(0, 200),
      meta: { args: proposal.args, ok: false, error: String(error) },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Действие не выполнено' },
      { status: 500 },
    );
  }
}
