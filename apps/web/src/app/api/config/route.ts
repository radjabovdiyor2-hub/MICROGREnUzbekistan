import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings/store';

// ==========================================
// Публичный конфиг сайта.
//
// Это единственная точка, через которую живые настройки доходят до
// клиентских компонентов и до магазинного бота (apps/bot,
// config_service.py опрашивает этот адрес с кэшем 5 минут — правок в
// боте не потребовалось, он начал получать новые значения сам).
//
// Раньше отдавал статику из lib/site.ts: bannerEnabled был захардкожен
// в false, поэтому включить объявление на сайте было нельзя в принципе.
// ==========================================

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();

  return NextResponse.json({
    heroTitle: s['content.heroTitle'],
    heroSubtitle: s['content.heroSubtitle'],
    deliveryFee: s['delivery.fee'],
    freeDeliveryThreshold: s['delivery.freeThreshold'],
    deliveryTimePromise: s['delivery.timePromise'],
    contactPhone: s['contacts.phonePrimary'],
    contactPhoneSecondary: s['contacts.phoneSecondary'],
    contactEmail: s['contacts.email'],
    address: s['contacts.address'],
    workHours: {
      weekday: s['content.workHoursWeekday'],
      sunday: s['content.workHoursSunday'],
    },
    // Рубильник ИИ. Здесь он потому, что магазинный бот — другой модуль
    // и ходит в витрину только по HTTP: другого пути узнать о
    // выключении у него нет, а второй выключатель «для бота» означал
    // бы, что один из них однажды забудут переключить.
    //
    // Публичность безвредна: это не секрет, а состояние, которое любой
    // и так узнаёт, написав боту.
    aiEnabled: s['ai.enabled'],
    bannerEnabled: s['content.bannerEnabled'],
    bannerText: s['content.bannerText'],
    paymentMethods: s['payment.methods'],
    // Бонусы. Бот раньше держал эти суммы литералами и обещал вдесятеро
    // меньше, чем начисляет /api/referral: он считал в модели «1 балл =
    // 10 сум», которой в коде витрины никогда не было. Балл равен суму,
    // а суммы — вот они, одни на все каналы.
    bonus: {
      referrerReward: s['bonus.referrerReward'],
      newUserReward: s['bonus.newUserReward'],
      minCashout: s['bonus.minCashout'],
      referralPercent: s['bonus.referralPercent'],
    },
    magazinePrintPrice: s['magazine.printPrice'],
    social: {
      telegramChannel: s['contacts.telegramChannelUrl'],
      // Историческое поле: бот ждёт telegramGroup, отдельной группы нет —
      // отдаём канал, как и раньше, чтобы не сломать config_service.py.
      telegramGroup: s['contacts.telegramChannelUrl'],
      telegramBot: s['contacts.telegramBotUrl'],
      instagram: s['contacts.instagramUrl'],
      whatsapp: s['contacts.whatsappUrl'],
    },
  });
}
