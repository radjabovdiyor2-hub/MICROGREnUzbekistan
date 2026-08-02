import { prisma } from '@repo/database';

export async function SalesDirectiveBanner() {
    const behavior = await prisma.botLearning.findFirst({
      where: {
        bot: 'sales_bot',
        metric: 'conversion',
        isActive: true,
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (!behavior || !behavior.adjustment) return null;

    const adj = behavior.adjustment as Record<string, unknown>;
    const directives = Object.values(adj).filter(v => typeof v === 'string').join(' ');

    if (!directives) return null;

    return (
      <div style={{
        background: 'var(--brand-primary)',
        color: 'var(--bg-primary)',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: '0.875rem',
        fontWeight: '500',
        zIndex: 50,
        position: 'relative'
      }}>
        ✨ Рекомендация отдела продаж: {directives}
      </div>
    );

}
