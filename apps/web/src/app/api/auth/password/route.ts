import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Password stored in a simple JSON file. In production use bcrypt + DB.
const PASSWORD_FILE = path.join(process.cwd(), '.admin-password.json');
const DEFAULT_PASSWORD = 'Microgreen2026';

function getPassword(): string {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf-8'));
      return data.password || DEFAULT_PASSWORD;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_PASSWORD;
}

function setPassword(newPassword: string): void {
  fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password: newPassword, updatedAt: new Date().toISOString() }), 'utf-8');
}

// POST - Change password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Barcha maydonlarni to'ldiring" }, { status: 400 });
    }

    const storedPassword = getPassword();

    if (currentPassword !== storedPassword) {
      return NextResponse.json({ error: "Joriy parol noto'g'ri" }, { status: 401 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Yangi parol kamida 6 ta belgi bo'lishi kerak" }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: "Yangi parol eski paroldan farqli bo'lishi kerak" }, { status: 400 });
    }

    setPassword(newPassword);

    return NextResponse.json({ success: true, message: "Parol muvaffaqiyatli o'zgartirildi" });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json({ error: 'Server xatosi' }, { status: 500 });
  }
}

// GET - Validate password (for login)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const password = searchParams.get('password');

  if (!password) {
    return NextResponse.json({ valid: false });
  }

  const storedPassword = getPassword();
  return NextResponse.json({ valid: password === storedPassword });
}
