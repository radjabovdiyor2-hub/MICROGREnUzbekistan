import { NextResponse } from 'next/server';

import { safeError } from '@/lib/safeError';
import { getSetting } from '@/lib/settings/store';

// ══════════════════════════════════════════════════════════════════════
// Какая версия приложения считается свежей.
//
// ЗАЧЕМ. APK ставится файлом, мимо магазина, — значит сам он не
// обновится никогда. Человек может полгода ходить со сборкой, в которой
// сломан сбор трека, и никто об этом не узнает: приложение ведь
// «работает». Поэтому оно спрашивает у витрины, не вышло ли новое, и
// говорит об этом само.
//
// ЧИСЛО ЗАДАЁТ ВЛАДЕЛЕЦ в настройках, а не сборщик: выложить файл и
// объявить его свежим — это одно решение одного человека, и делить его
// между CI и админкой значит однажды объявить версию, которой нет.
//
// ПУСТО — ЗНАЧИТ МОЛЧИМ. Приложением могут не пользоваться вовсе.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [version, url] = await Promise.all([
      getSetting('field.appVersion'),
      getSetting('field.appUrl'),
    ]);

    return NextResponse.json({
      status: 'ok',
      version: String(version).trim(),
      url: String(url).trim(),
    });
  } catch (error: unknown) {
    console.error('API App Version GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
