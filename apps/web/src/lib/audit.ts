import fs from 'fs';
import path from 'path';

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

/**
 * Пишет запись в журнал. Никогда не бросает исключение: аудит не должен
 * ронять бизнес-операцию, ради которой его вызвали.
 */
export function audit(entry: AuditEntry): void {
  const record = {
    ts: new Date().toISOString(),
    ...entry,
  };

  const line = JSON.stringify(record);

  // stdout — попадает в docker-логи даже если файловая система только для чтения.
  console.log(`[audit] ${line}`);

  try {
    const file = logFile();
    if (!ensureDir(file)) return;
    fs.appendFileSync(file, `${line}\n`, 'utf-8');
  } catch {
    // Диск недоступен — довольствуемся stdout.
  }
}
