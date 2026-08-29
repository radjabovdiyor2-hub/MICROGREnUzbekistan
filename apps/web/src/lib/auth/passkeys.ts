import fs from 'node:fs';
import crypto from 'node:crypto';

import { stateFile } from '@/lib/stateDir';

// ══════════════════════════════════════════════════════════════════════
// Ключи входа по Face ID / Touch ID: хранилище и одноразовые задачи.
//
// ЧТО БЫЛО СЛОМАНО И ПОЧЕМУ ВХОД БЫЛ ВЫКЛЮЧЕН
//
// Прежняя реализация подпись НЕ ПРОВЕРЯЛА: `login-verify` сверял только
// `credential.id` со списком, а `login-options` этот же id и выдавал. Войти
// владельцем можно было двумя запросами без единой криптографической
// проверки — то есть вход по ключу был не входом, а объявлением о себе.
// Публичный ключ при регистрации не сохранялся вовсе: в колонку клался сам
// идентификатор. Поэтому вход и отключили, оставив 501.
//
// Здесь ключ хранится по-настоящему, а проверку подписи делает
// `@simplewebauthn/server` — свою криптографию для этого писать нельзя.
//
// ГДЕ ЛЕЖИТ. В STATE_DIR, а не в слое образа: иначе привязанные ключи
// исчезали бы при каждой выкатке вместе с контейнером. И не в базе — чтобы
// вход работал, когда база недоступна: пароль в такой момент тоже работает
// (он в переменной окружения), и терять второй способ входа вместе с первым
// было бы обидно.
//
// ЗАДАЧА (challenge) ОДНОРАЗОВАЯ. Она и есть защита от повтора: та же
// подпись, посланная второй раз, не должна пускать. Поэтому `takeChallenge`
// удаляет её при чтении, а не «когда-нибудь по сроку».
// ══════════════════════════════════════════════════════════════════════

const FILE = stateFile('.admin-webauthn.json');

/** Сколько живёт задача. Ровно столько, сколько человек ищет палец. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface StoredCredential {
  /** base64url идентификатора ключа. */
  id: string;
  /** base64url публичного ключа — то, чем проверяется подпись. */
  publicKey: string;
  /**
   * Счётчик подписей аутентификатора.
   *
   * Растёт с каждым входом. Если пришло значение НЕ больше сохранённого —
   * это либо повтор, либо клон ключа. Аутентификаторы Apple и многие
   * платформенные счётчик не ведут и всегда шлют ноль: тогда сверять нечего
   * (см. `counterLooksCloned`).
   */
  counter: number;
  transports?: string[];
  createdAt: string;
  /** Человеческая подпись: «iPhone владельца», «Рабочий ноутбук». */
  label: string;
}

interface Store {
  credentials: StoredCredential[];
  challenges: Record<string, { challenge: string; expires: number }>;
}

const EMPTY: Store = { credentials: [], challenges: {} };

function load(): Store {
  try {
    if (!fs.existsSync(FILE)) return { ...EMPTY, credentials: [], challenges: {} };
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Partial<Store>;
    return {
      credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
      challenges: parsed.challenges && typeof parsed.challenges === 'object' ? parsed.challenges : {},
    };
  } catch (error) {
    // Битый файл — работаем как с пустым: иначе сломанный JSON закрыл бы
    // вход по ключу целиком. Но молчать нельзя, иначе причина потеряется.
    console.error('[passkeys] хранилище не прочитано:', error);
    return { credentials: [], challenges: {} };
  }
}

function save(store: Store): void {
  const now = Date.now();
  for (const [key, value] of Object.entries(store.challenges)) {
    if (value.expires < now) delete store.challenges[key];
  }
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/** Привязанные ключи. */
export function listCredentials(): StoredCredential[] {
  return load().credentials;
}

/** Есть ли хоть один ключ — по этому вопросу решается, показывать ли кнопку. */
export function hasCredentials(): boolean {
  return load().credentials.length > 0;
}

export function findCredential(id: string): StoredCredential | null {
  return load().credentials.find((c) => c.id === id) ?? null;
}

export function addCredential(credential: StoredCredential): void {
  const store = load();
  store.credentials = store.credentials.filter((c) => c.id !== credential.id);
  store.credentials.push(credential);
  save(store);
}

export function removeCredential(id: string): void {
  const store = load();
  store.credentials = store.credentials.filter((c) => c.id !== id);
  save(store);
}

export function updateCounter(id: string, counter: number): void {
  const store = load();
  const cred = store.credentials.find((c) => c.id === id);
  if (!cred) return;
  cred.counter = counter;
  save(store);
}

/**
 * Клон ключа или повтор запроса.
 *
 * Счётчик обязан расти. Ноль с обеих сторон — обычное дело: платформенные
 * аутентификаторы Apple его не ведут, и требовать роста значило бы не
 * пускать владельца с айфона вовсе.
 */
export function counterLooksCloned(stored: number, incoming: number): boolean {
  if (stored === 0 && incoming === 0) return false;
  return incoming <= stored;
}

/** Завести одноразовую задачу. Возвращает её идентификатор для клиента. */
export function putChallenge(challenge: string, now = Date.now()): string {
  const store = load();
  const id = crypto.randomBytes(16).toString('base64url');
  store.challenges[id] = { challenge, expires: now + CHALLENGE_TTL_MS };
  save(store);
  return id;
}

/**
 * Забрать задачу — ровно один раз.
 *
 * Удаление при чтении и есть защита от повтора: та же подпись, посланная
 * второй раз, задачи уже не найдёт.
 */
export function takeChallenge(id: string, now = Date.now()): string | null {
  const store = load();
  const found = store.challenges[id];
  delete store.challenges[id];
  save(store);
  if (!found) return null;
  if (found.expires < now) return null;
  return found.challenge;
}
