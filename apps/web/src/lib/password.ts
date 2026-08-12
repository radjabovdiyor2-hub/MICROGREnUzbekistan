import fs from 'fs';
import crypto from 'crypto';
import { stateFile } from '@/lib/stateDir';

// ════════════════════════════════════════════════════════════════════
// Пароль владельца: хранение и проверка.
//
// Было: пароль лежал открытым текстом в .admin-password.json, а при
// отсутствии файла действовал ЗАХАРДКОЖЕННЫЙ дефолт 'Microgreen2026'
// — он же в публичной истории репозитория. Дефолт удалён полностью.
//
// Стало: scrypt-хеш с солью. Источники (по приоритету):
//   1. .admin-password.json  — пароль, заданный через UI «Настройки»
//   2. ADMIN_PASSWORD_HASH   — заранее посчитанный хеш в .env
//   3. ADMIN_PASSWORD        — открытый пароль в .env (проще в эксплуатации)
// Ни один не настроен → в проде вход закрыт (fail closed).
//
// Только node-рантайм: crypto.scrypt в edge недоступен.
// ════════════════════════════════════════════════════════════════════

// Каталог задаётся STATE_DIR и в проде смонтирован томом: файл в слое образа
// стирался каждым деплоем, возвращая утёкший пароль из окружения.
const PASSWORD_FILE = stateFile('.admin-password.json');

const SCRYPT_KEYLEN = 64;
const MIN_PASSWORD_LENGTH = 8;

export { MIN_PASSWORD_LENGTH };

/** Хеширует пароль: scrypt$<соль>$<хеш>. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Сверяет пароль с хешем в постоянном времени. */
function verifyHash(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, saltHex, hashHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;

  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN);
  return crypto.timingSafeEqual(actual, expected);
}

/** Сравнение открытых строк в постоянном времени (для legacy и ADMIN_PASSWORD). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

interface PasswordFile {
  /** scrypt-хеш. Основной формат. */
  hash?: string;
  /** Пароль открытым текстом — формат до этого изменения. */
  password?: string;
  updatedAt?: string;
}

function readPasswordFile(): PasswordFile | null {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      return JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf-8'));
    }
  } catch {
    // повреждённый файл — считаем, что источника нет
  }
  return null;
}

/** Записывает новый пароль (всегда хешем). */
export function setPassword(newPassword: string): void {
  const data: PasswordFile = {
    hash: hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PASSWORD_FILE, JSON.stringify(data), 'utf-8');
}

/** Настроен ли вообще хоть один источник пароля. */
export function isPasswordConfigured(): boolean {
  const file = readPasswordFile();
  if (file?.hash || file?.password) return true;
  return Boolean(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD);
}

/**
 * Проверяет пароль владельца.
 *
 * Побочный эффект: если файл ещё в старом открытом формате и пароль подошёл,
 * он тут же перезаписывается хешем — миграция без участия оператора.
 */
export function verifyPassword(password: string): boolean {
  if (!password) return false;

  const file = readPasswordFile();

  if (file?.hash) {
    return verifyHash(password, file.hash);
  }

  if (file?.password) {
    const ok = safeEqual(password, file.password);
    if (ok) {
      try {
        setPassword(password);
        console.warn('[auth] .admin-password.json переведён из открытого текста в scrypt-хеш');
      } catch {
        // не смогли записать — вход всё равно засчитываем
      }
    }
    return ok;
  }

  const envHash = process.env.ADMIN_PASSWORD_HASH;
  if (envHash) return verifyHash(password, envHash);

  const envPlain = process.env.ADMIN_PASSWORD;
  if (envPlain) return safeEqual(password, envPlain);

  // Источника нет. Раньше здесь срабатывал дефолт 'Microgreen2026'.
  console.error(
    'FATAL: пароль админки не настроен (.admin-password.json / ADMIN_PASSWORD_HASH / ADMIN_PASSWORD) — вход закрыт',
  );
  return false;
}
