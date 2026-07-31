import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// Журнал действий (DD §6.4 «Session log»).
//
// В форме Due Diligence заявлено «barcha kirish va amallar log fayllariga
// yoziladi» — на деле никакого журнала не было: логин не оставлял следа,
// а изменения товаров, цен и продаж нельзя было привязать к автору.
// Без него после отпуска владельца нельзя ответить на вопрос «кто это сделал».
//
// Формат — JSON Lines: одна запись в строке, читается grep/jq, легко
// грузится в ELK, если он появится. Дублируется в stdout, чтобы попадать
// в docker json-file драйвер (он уже настроен с ротацией).
//
// Каждая строка подписана HMAC-SHA256 с цепочкой (prev_hmac):
// подделка или удаление записей детектируется верификацией.
// ══════════════════════════════════════════════════════════════════════

export interface AuditEntry {
  /** Что произошло: login.success, product.update, pos.sale … */
  action: string;
  /** Кто: 'owner', имя продавца, 'bot'. */
  actor?: string;
  role?: string;
  ip?: string;
  /** Над чем: id товара, номер заказа. */
  target?: string;
  /** Любые детали события. PII сюда не кладём. */
  meta?: Record<string, unknown>;
}

/** Куда пишем. Каталог задаётся AUDIT_LOG_DIR, иначе — logs/ у процесса. */
function logFile(): string {
  const dir = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), 'logs');
  const day = new Date().toISOString().slice(0, 10);
  return path.join(dir, `audit-${day}.jsonl`);
}

let dirReady = false;

function ensureDir(file: string): boolean {
  if (dirReady) return true;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    dirReady = true;
    return true;
  } catch {
    return false;
  }
}

// Chain: HMAC каждой записи включает HMAC предыдущей — удаление строки
// нарушает цепочку и обнаруживается при верификации.
let prevHmac = '0';

function hmacSign(data: string): string {
  const secret = process.env.AUDIT_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(data).digest('hex').slice(0, 16);
}

/**
 * Пишет запись в журнал. Никогда не бросает исключение: аудит не должен
 * ронять бизнес-операцию, ради которой его вызвали.
 */
export function audit(entry: AuditEntry): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    ...entry,
  };

  const body = JSON.stringify(record);
  const sig = hmacSign(`${prevHmac}|${body}`);
  if (sig) {
    record._prev = prevHmac;
    record._sig = sig;
    prevHmac = sig;
  }

  const line = JSON.stringify(record);

  // stdout — попадает в docker-логи даже если файловая система только для чтения.
  console.log(`[audit] ${line}`);

  try {
    const file = logFile();
    if (ensureDir(file)) fs.appendFileSync(file, `${line}\n`, 'utf-8');
  } catch {
    // Диск недоступен — довольствуемся stdout.
  }

  // Дубль в БД — только чтобы журнал можно было листать в админке.
  // Источником доказательств остаётся файл: там цепочка HMAC, а строку в
  // таблице администратор БД может незаметно поправить.
  //
  // Не блокируем вызывающего и гасим ошибку: аудит не имеет права уронить
  // операцию, ради которой его позвали (тот же контракт, что и у файла).
  void persistToDb(entry);
}

async function persistToDb(entry: AuditEntry): Promise<void> {
  try {
    // Ленивый импорт: audit() зовут из путей, где Prisma может быть не нужна,
    // а таблицы может ещё не быть — сразу после деплоя, до db push.
    const { prisma } = await import('@repo/database');
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actor: entry.actor ?? null,
        role: entry.role ?? null,
        ip: entry.ip ?? null,
        target: entry.target ? String(entry.target).slice(0, 255) : null,
        meta: (entry.meta ?? undefined) as never,
      },
    });
  } catch {
    // Файл и stdout уже записаны — этого достаточно.
  }
}

