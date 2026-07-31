import { prisma } from '@repo/database';
import {
  SETTINGS, coerceSetting, defaultSettings,
  type SettingDef, type SettingKey,
} from './registry';

// ══════════════════════════════════════════════════════════════════════
// Чтение бизнес-настроек на сервере.
//
// Правило безопасности: этот модуль НИКОГДА не бросает исключение.
// Настройки читаются на пути оформления заказа и на главной странице —
// упавший запрос к БД не должен ронять магазин. При любой ошибке
// (нет связи, таблица ещё не создана после деплоя) отдаём дефолты
// реестра, то есть ровно то поведение, что было до этой фичи.
//
// Кэш на 30 секунд: настройки читаются десятки раз за рендер, а меняются
// раз в месяц. Запись через setSetting() сбрасывает кэш сразу, поэтому
// владелец видит результат мгновенно, а не через полминуты.
// ══════════════════════════════════════════════════════════════════════

type SettingsMap = Record<string, unknown>;

const CACHE_TTL_MS = 30_000;

let cache: SettingsMap | null = null;
let cacheAt = 0;
let inflight: Promise<SettingsMap> | null = null;

/** Сбросить кэш — вызывается после любой записи. */
export function invalidateSettings(): void {
  cache = null;
  cacheAt = 0;
}

async function loadFromDb(): Promise<SettingsMap> {
  const merged = defaultSettings();
  try {
    const rows = await prisma.appSetting.findMany();
    for (const row of rows) {
      // Значение могло быть записано до того, как ключ убрали из реестра,
      // либо тип ключа изменился — прогоняем через ту же валидацию, что и
      // на записи, и молча игнорируем несовместимое.
      const res = coerceSetting(row.key, row.value);
      if (res.ok) merged[row.key] = res.value;
    }
  } catch (error) {
    // Ни в коем случае не пробрасываем: магазин важнее настроек.
    console.error('[settings] чтение из БД не удалось, работаем на дефолтах:', error);
  }
  return merged;
}

/** Все настройки: дефолты реестра, поверх — сохранённые владельцем. */
export async function getSettings(): Promise<SettingsMap> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  // Схлопываем параллельные запросы: на холодном кэше главная страница
  // дёргает getSettings() из нескольких компонентов одновременно.
  if (inflight) return inflight;

  inflight = loadFromDb()
    .then(result => {
      cache = result;
      cacheAt = Date.now();
      return result;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

/** Одно значение с типом дефолта. */
export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<(typeof SETTINGS)[K]['default']> {
  const all = await getSettings();
  return all[key] as (typeof SETTINGS)[K]['default'];
}

/** Число с гарантией типа — для расчётов цен и порогов. */
export async function getNumber(key: SettingKey): Promise<number> {
  const v = await getSetting(key);
  return typeof v === 'number' ? v : Number(v) || 0;
}

/**
 * Записать настройки. Возвращает применённые значения и ошибки валидации
 * по ключам — частичное применение допускается: одна кривая настройка не
 * должна отменять сохранение остальных.
 */
export async function setSettings(
  patch: Record<string, unknown>,
  actor: string,
): Promise<{ applied: Record<string, unknown>; errors: Record<string, string> }> {
  const applied: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(patch)) {
    const def = (SETTINGS as Record<string, SettingDef>)[key];
    if (!def) {
      errors[key] = 'Неизвестная настройка';
      continue;
    }
    const res = coerceSetting(key, raw);
    if (!res.ok) {
      errors[key] = res.error;
      continue;
    }

    try {
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: res.value as never, category: def.category, updatedBy: actor },
        update: { value: res.value as never, category: def.category, updatedBy: actor },
      });
      applied[key] = res.value;
    } catch (error) {
      console.error(`[settings] не удалось сохранить ${key}:`, error);
      errors[key] = 'Ошибка записи в базу';
    }
  }

  if (Object.keys(applied).length) invalidateSettings();
  return { applied, errors };
}

/**
 * Авторитетный расчёт доставки на сервере.
 *
 * Синхронный deliveryFeeFor() из lib/site.ts остаётся для клиента (он
 * получает те же числа через /api/config), но итоговую сумму заказа
 * считает только эта функция — клиенту в вопросе денег не доверяем.
 */
export async function deliveryFeeForSubtotal(subtotal: number): Promise<number> {
  const [fee, threshold] = await Promise.all([
    getNumber('delivery.fee'),
    getNumber('delivery.freeThreshold'),
  ]);
  return subtotal >= threshold ? 0 : fee;
}
