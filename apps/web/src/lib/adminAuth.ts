import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ════════════════════════════════════════════════════════════
// Серверная авторизация admin-роутов журнала (фикс: раньше admin-API
// журнала гейтились только клиентским sessionStorage).
//  · x-admin-password — пароль владельца (тот же, что в /api/auth/password)
//  · x-bot-secret     — server-to-server (генерация PDF, office-боты)
// ════════════════════════════════════════════════════════════

const PASSWORD_FILE = path.join(process.cwd(), '.admin-password.json');
const DEFAULT_PASSWORD = 'Microgreen2026';

function getAdminPassword(): string {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf-8'));
      return data.password || DEFAULT_PASSWORD;
    }
  } catch {
    // fall through
  }
  return DEFAULT_PASSWORD;
}

export function isAuthorized(request: Request): boolean {
  const pw = request.headers.get('x-admin-password');
  if (pw && pw === getAdminPassword()) return true;

  const secret = request.headers.get('x-bot-secret');
  if (secret && process.env.BOT_SECRET && secret === process.env.BOT_SECRET) return true;

  return false;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
