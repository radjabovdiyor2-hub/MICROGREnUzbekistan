// ══════════════════════════════════════════════════════════════════════
// Счётчики приложения в формате Prometheus (DD §4.8 «Monitoring»).
//
// В форме Due Diligence мониторинг описан как docker-логи + heartbeat ботов,
// с пометкой «ELK/Grafana/Prometheus hali ulangan emas». Метрик у веб-части
// не было вовсе: сколько было неудачных входов, сколько запросов отбил
// rate-limit, жива ли база — узнать было неоткуда.
//
// Реестр намеренно свой, без prom-client: нужно несколько счётчиков, а не
// ещё одна зависимость в проде. Значения живут в памяти процесса и
// обнуляются при рестарте — для counter'ов это нормально, Prometheus
// считает rate() и переживает сброс.
// ══════════════════════════════════════════════════════════════════════

type Labels = Record<string, string>;

interface Counter {
  name: string;
  help: string;
  values: Map<string, { labels: Labels; value: number }>;
}

const counters = new Map<string, Counter>();

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

/** Увеличивает счётчик; создаёт его при первом обращении. */
export function inc(name: string, help: string, labels: Labels = {}, by = 1): void {
  let counter = counters.get(name);
  if (!counter) {
    counter = { name, help, values: new Map() };
    counters.set(name, counter);
  }

  const key = labelKey(labels);
  const existing = counter.values.get(key);
  if (existing) {
    existing.value += by;
  } else {
    counter.values.set(key, { labels, value: by });
  }
}

/** Экранирование значения метки по спецификации Prometheus. */
function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const inner = entries
    .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
    .join(',');
  return `{${inner}}`;
}

/** Дополнительные gauge-значения, считаемые на лету в момент scrape. */
export interface Gauge {
  name: string;
  help: string;
  value: number;
  labels?: Labels;
}

/** Рендерит всё в text-формат Prometheus (version 0.0.4). */
export function render(gauges: Gauge[] = []): string {
  const lines: string[] = [];

  for (const counter of counters.values()) {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    for (const { labels, value } of counter.values.values()) {
      lines.push(`${counter.name}${formatLabels(labels)} ${value}`);
    }
  }

  for (const gauge of gauges) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    lines.push(`${gauge.name}${formatLabels(gauge.labels || {})} ${gauge.value}`);
  }

  return `${lines.join('\n')}\n`;
}

// ── Готовые счётчики, чтобы имена не расползались по коду ──────────────

export const Metrics = {
  // `telegram` — вход владельца из Mini App по подписи initData
  // (/api/auth/telegram-admin). Отдельная метка нужна, чтобы отличить
  // подобранный пароль от чужого Telegram-аккаунта, стучащегося в админку.
  loginFailed: (kind: 'password' | 'pin' | 'telegram') =>
    inc('mg_auth_failed_total', 'Неудачные попытки входа', { kind }),

  loginSuccess: (role: string) =>
    inc('mg_auth_success_total', 'Успешные входы', { role }),

  rateLimited: (route: string) =>
    inc('mg_rate_limited_total', 'Запросы, отклонённые лимитом', { route }),

  unauthorized: (route: string) =>
    inc('mg_unauthorized_total', 'Запросы без прав доступа', { route }),
};
