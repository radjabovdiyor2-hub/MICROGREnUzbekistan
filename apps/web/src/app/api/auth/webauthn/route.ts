import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

// WebAuthn credential storage — JSON file alongside password
const WEBAUTHN_FILE = path.join(process.cwd(), '.admin-webauthn.json');

interface StoredCredential {
  id: string;        // base64url credential ID
  publicKey: string;  // base64url public key (COSE → raw)
  counter: number;
  createdAt: string;
  label: string;      // "Face ID", "Touch ID", etc.
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
  } catch {}
  return { credentials: [], challenges: {} };
}

function saveStore(store: WebAuthnStore): void {
  // Cleanup expired challenges
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

function fromBase64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

// POST /api/auth/webauthn
// Actions: register-options, register-verify, login-options, login-verify, list, delete
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ════════════════════════════════════════════════════════════════════
  // ВХОД ПО FACE ID ОТКЛЮЧЁН.
  //
  // Реализация ниже не проверяла подпись: `login-verify` сверял только то,
  // что присланный credential.id есть в хранилище, а `login-options` этот
  // самый id и отдавал в allowCredentials. То есть вход владельцем
  // выполнялся двумя обычными HTTP-запросами, без устройства и биометрии.
  // Хранилище это и не позволяло починить на месте: в поле publicKey
  // записывался тот же id, настоящий ключ никогда не сохранялся.
  //
  // Чинить это вручную (разбор CBOR/COSE, проверка attestation и подписи)
  // — писать криптографию с нуля, чего делать нельзя. Правильный путь:
  // @simplewebauthn/server + перерегистрация ключей. До тех пор вход
  // закрыт, пароль остаётся рабочим способом входа.
  // ════════════════════════════════════════════════════════════════════
  if (action === 'login-options' || action === 'login-verify') {
    return NextResponse.json(
      {
        error:
          'Face ID kirish vaqtincha o\'chirilgan (xavfsizlik yangilanishi). Parol bilan kiring.',
        code: 'WEBAUTHN_DISABLED',
      },
      { status: 501 },
    );
  }

  // Регистрация ключа, список и удаление — только для вошедшего владельца.
  // Раньше не проверялось вообще: посторонний мог привязать свой Face ID
  // и войти как владелец.
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
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
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

    // Store credential (simplified — in production verify attestation properly)
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

  if (action === 'login-options') {
    const store = loadStore();
    if (store.credentials.length === 0) {
      return NextResponse.json({ error: 'No credentials registered' }, { status: 404 });
    }

    const challenge = base64url(crypto.randomBytes(32));
    const sessionId = base64url(crypto.randomBytes(16));
    store.challenges[sessionId] = { challenge, expires: Date.now() + 5 * 60 * 1000 };
    saveStore(store);

    const rpId = getRpId(req);

    return NextResponse.json({
      sessionId,
      publicKey: {
        challenge,
        rpId,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: store.credentials.map((c) => ({
          id: c.id,
          type: 'public-key' as const,
        })),
      },
    });
  }

  if (action === 'login-verify') {
    const store = loadStore();
    const { sessionId, credential } = body;
    const session = store.challenges[sessionId];
    if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 400 });
    delete store.challenges[sessionId];

    const stored = store.credentials.find((c) => c.id === credential.id);
    if (!stored) return NextResponse.json({ error: 'Unknown credential' }, { status: 401 });

    // Update counter (simplified verification — in production verify signature)
    stored.counter++;
    saveStore(store);

    return NextResponse.json({ ok: true, label: stored.label });
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
