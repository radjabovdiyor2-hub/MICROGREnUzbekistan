import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import crypto from 'crypto';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { stateFile } from '@/lib/stateDir';

// ════════════════════════════════════════════════════════════════════
// WebAuthn (Face ID / Touch ID) — ВХОД ОТКЛЮЧЁН.
//
// Прежняя реализация не проверяла подпись: login-verify сверял только
// credential.id из хранилища, а login-options этот id и выдавал.
// Вход владельцем выполнялся двумя HTTP-запросами без криптографии.
// publicKey никогда не сохранялся корректно.
//
// Для починки нужен @simplewebauthn/server + полная перерегистрация.
// До тех пор все login-действия возвращают 501.
//
// Оставлены: list / delete (управление уже привязанными ключами) и
// register-options / register-verify (для подготовки к переходу на
// @simplewebauthn). Все под isAuthorized — без пароля не войти.
// ════════════════════════════════════════════════════════════════════

// STATE_DIR, а не слой образа: иначе привязанные passkeys исчезали при
// каждом деплое вместе с файлом.
const WEBAUTHN_FILE = stateFile('.admin-webauthn.json');

interface StoredCredential {
  id: string;
  publicKey: string;
  counter: number;
  createdAt: string;
  label: string;
}

interface WebAuthnStore {
  credentials: StoredCredential[];
  challenges: Record<string, { challenge: string; expires: number }>;
}

function loadStore(): WebAuthnStore {
  try {
    if (fs.existsSync(WEBAUTHN_FILE)) {
      return JSON.parse(fs.readFileSync(WEBAUTHN_FILE, 'utf-8'));
    }
  } catch (error) {
    // Файл хранилища битый или недоступен: работаем как с пустым — иначе
    // сломанный JSON уронил бы вход по ключу целиком. Но молчать нельзя.
    console.error('[webauthn] хранилище не прочитано:', error);
  }
  return { credentials: [], challenges: {} };
}

function saveStore(store: WebAuthnStore): void {
  const now = Date.now();
  for (const [k, v] of Object.entries(store.challenges)) {
    if (v.expires < now) delete store.challenges[k];
  }
  fs.writeFileSync(WEBAUTHN_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function getRpId(req: NextRequest): string {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  return host.split(':')[0];
}

const RP_NAME = 'Microgreen Admin';
const USER_ID = 'admin';

function base64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'login-options' || action === 'login-verify') {
    return NextResponse.json(
      {
        error:
          "Face ID kirish vaqtincha o'chirilgan (xavfsizlik yangilanishi). Parol bilan kiring.",
        code: 'WEBAUTHN_DISABLED',
      },
      { status: 501 },
    );
  }

  if (!isAuthorized(req)) return unauthorized();

  if (action === 'register-options') {
    const store = loadStore();
    const challenge = base64url(crypto.randomBytes(32));
    const sessionId = base64url(crypto.randomBytes(16));
    store.challenges[sessionId] = { challenge, expires: Date.now() + 5 * 60 * 1000 };
    saveStore(store);

    const rpId = getRpId(req);

    return NextResponse.json({
      sessionId,
      publicKey: {
        challenge,
        rp: { id: rpId, name: RP_NAME },
        user: {
          id: base64url(Buffer.from(USER_ID)),
          name: 'admin',
          displayName: 'Администратор',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        excludeCredentials: store.credentials.map((c) => ({
          id: c.id,
          type: 'public-key' as const,
        })),
      },
    });
  }

  if (action === 'register-verify') {
    const store = loadStore();
    const { sessionId, credential, label } = body;
    const session = store.challenges[sessionId];
    if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 400 });
    delete store.challenges[sessionId];

    const cred: StoredCredential = {
      id: credential.id,
      publicKey: credential.response?.publicKey || credential.id,
      counter: 0,
      createdAt: new Date().toISOString(),
      label: label || 'Biometric',
    };
    store.credentials.push(cred);
    saveStore(store);

    return NextResponse.json({ ok: true, credentialId: cred.id });
  }

  if (action === 'list') {
    const store = loadStore();
    return NextResponse.json({
      credentials: store.credentials.map((c) => ({
        id: c.id,
        label: c.label,
        createdAt: c.createdAt,
      })),
    });
  }

  if (action === 'delete') {
    const store = loadStore();
    store.credentials = store.credentials.filter((c) => c.id !== body.credentialId);
    saveStore(store);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
