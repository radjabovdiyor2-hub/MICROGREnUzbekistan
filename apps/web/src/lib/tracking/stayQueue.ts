// ══════════════════════════════════════════════════════════════════════
// Очередь полевых действий, переживающая отсутствие связи.
//
// ПОЧЕМУ INDEXEDDB, А НЕ localStorage. Очередь отметок визита (`visitQueue`)
// живёт в localStorage и правильно делает: там короткие записи. Здесь в
// очередь попадает КАДР С КАМЕРЫ — 3–5 МБ. Весь localStorage — около
// пяти мегабайт на домен, то есть второе фото уже не влезет, а
// переполнение он сообщает исключением посреди записи. IndexedDB держит
// двоичные данные и не имеет такого потолка.
//
// ПОРЯДОК ВАЖЕН. «Уехал» и фото ссылаются на стоянку через `clientRef` —
// ключ, который телефон выдаёт сам, ещё до отправки. Поэтому отправлять
// надо строго в порядке появления: если «уехал» уйдёт раньше «я на
// точке», сервер не найдёт стоянку и запись пропадёт.
// ══════════════════════════════════════════════════════════════════════

const DB_NAME = 'mg-field';
const STORE = 'queue';
const DB_VERSION = 1;

/** Дольше этого запись не держим — как и у очереди визитов. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type FieldActionKind = 'arrive' | 'leave' | 'photo';

export interface FieldAction {
  /** Растущий номер — он же порядок отправки. Ставит IndexedDB. */
  id?: number;
  kind: FieldActionKind;
  /** Ключ стоянки, выданный телефоном. Связывает три действия воедино. */
  clientRef: string;
  /** Когда действие СЛУЧИЛОСЬ, а не когда его отправили. */
  at: number;
  customerId?: number;
  /** Кадр — только у `photo`. */
  blob?: Blob;
}

/** Ключ стоянки: время плюс случайность. Совпасть у двух телефонов нечему. */
export function newClientRef(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${Date.now().toString(36)}-${rand}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    // Приватный режим и старые движки могут не дать IndexedDB вовсе.
    // Тогда очереди нет — но само действие всё равно уйдёт, если связь
    // есть. Потерять функцию целиком из-за отсутствия хранилища нельзя.
    if (typeof indexedDB === 'undefined') return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** Положить действие в очередь. `false` — хранилище недоступно. */
export async function pushAction(action: FieldAction): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(action);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      resolve(false);
    };
  });
}

/** Всё, что ждёт связи, в порядке появления. */
export async function readActions(): Promise<FieldAction[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => {
      db.close();
      const rows = (request.result as FieldAction[]) ?? [];
      resolve(rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)));
    };
    request.onerror = () => {
      db.close();
      resolve([]);
    };
  });
}

export async function dropAction(id: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Делит очередь на живое и протухшее.
 *
 * Вынесено отдельной чистой функцией ради тестов: срок жизни записи — то
 * место, где легко потерять поездку молча.
 */
export function splitByAge(
  actions: FieldAction[],
  now: number = Date.now(),
): { fresh: FieldAction[]; stale: FieldAction[] } {
  const fresh: FieldAction[] = [];
  const stale: FieldAction[] = [];
  for (const action of actions) {
    if (now - action.at > MAX_AGE_MS) stale.push(action);
    else fresh.push(action);
  }
  return { fresh, stale };
}

/**
 * Запрос для одного действия очереди.
 *
 * Чистая функция: она решает, куда и что отправить, — и именно её проще
 * всего сломать, перепутав ссылку на стоянку. Поэтому она отделена от
 * самой отправки и покрыта тестами.
 */
export function requestFor(action: FieldAction): { url: string; init: RequestInit } | null {
  if (action.kind === 'arrive') {
    return {
      url: '/api/admin/tracking/stay',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: action.customerId,
          clientRef: action.clientRef,
          arrivedAt: action.at,
        }),
      },
    };
  }

  if (action.kind === 'leave') {
    return {
      url: '/api/admin/tracking/stay',
      init: {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientRef: action.clientRef, leftAt: action.at }),
      },
    };
  }

  if (!action.blob) return null;
  const form = new FormData();
  form.append('file', action.blob, 'visit.jpg');
  form.append('clientRef', action.clientRef);
  form.append('takenAt', String(action.at));
  return { url: '/api/admin/tracking/photo', init: { method: 'POST', body: form } };
}
