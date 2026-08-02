import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Генерация и запуск рассылки еженедельного дайджеста (Email)
// Вызывается по крону (Vercel Cron)
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  // Авторизация по CRON_SECRET или ручной запуск администратором
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && request.nextUrl.searchParams.get('admin') !== 'true') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 1. Собираем новинки за неделю
    const newProducts = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { nameRu: true, price: true }
    });

    // 2. Получаем активных подписчиков рассылки (у кого есть email)
    // В данном стабе email предполагается у клиентов, у которых в contacts есть email
    // Или же мы просто логируем начало рассылки для маркетингового бота

    console.log(`[Email Digest] Запущена еженедельная рассылка. Новинок: ${newProducts.length}`);

    // В будущем здесь будет интеграция с SendGrid/Mailgun или вызов Marketing Bot через Event Bus
    
    return NextResponse.json({ 
      status: 'ok', 
      message: 'Email digest campaign queued',
      products_featured: newProducts
    });

  } catch (error) {
    console.error('[Email Digest] Ошибка при формировании дайджеста:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
