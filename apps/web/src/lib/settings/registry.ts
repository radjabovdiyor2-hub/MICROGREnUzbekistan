import { SETTINGS, type SettingKey } from './settingsData';
import {
  SETTING_CATEGORIES,
  CATEGORY_LABELS,
  type SettingCategory,
  type SettingType,
  type SettingDef,
} from './settingsDefinitions';

export {
  SETTINGS,
  SETTING_CATEGORIES,
  CATEGORY_LABELS,
  type SettingCategory,
  type SettingType,
  type SettingDef,
  type SettingKey,
};

/** Значения по умолчанию — то, как система вела себя до появления настроек. */
export function defaultSettings(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    out[key] = (def as SettingDef).default;
  }
  return out;
}

export const PUBLIC_SETTING_KEYS: string[] = Object.entries(SETTINGS)
  .filter(([, def]) => (def as SettingDef).publicKey)
  .map(([key]) => key);

/**
 * Приводит присланное значение к типу настройки и проверяет границы.
 * Возвращает { ok:false }, если значение непригодно — вызывающий обязан
 * отказать, а не записывать мусор: настройки читает и сайт, и боты.
 */
export function coerceSetting(
  key: string,
  raw: unknown,
): { ok: true; value: number | string | boolean | string[] } | { ok: false; error: string } {
  const def = (SETTINGS as Record<string, SettingDef>)[key];
  if (!def) return { ok: false, error: `Неизвестная настройка: ${key}` };

  switch (def.type) {
    case 'number':
    case 'money': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, ''));
      if (!Number.isFinite(n)) return { ok: false, error: 'Ожидается число' };
      if (def.min !== undefined && n < def.min) return { ok: false, error: `Минимум ${def.min}` };
      if (def.max !== undefined && n > def.max) return { ok: false, error: `Максимум ${def.max}` };
      return { ok: true, value: n };
    }
    case 'boolean':
      return { ok: true, value: raw === true || raw === 'true' };
    case 'list': {
      const arr = Array.isArray(raw)
        ? raw.map(v => String(v).trim())
        : String(raw).split(',').map(v => v.trim());
      const clean = arr.filter(Boolean);
      if (!clean.length) return { ok: false, error: 'Список не может быть пустым' };
      if (def.allowed) {
        const unknown = clean.filter(v => !def.allowed!.includes(v));
        if (unknown.length) {
          return { ok: false, error: `Недопустимо: ${unknown.join(', ')}. Можно: ${def.allowed.join(', ')}` };
        }
      }
      return { ok: true, value: clean };
    }
    case 'string':
    case 'text': {
      const s = String(raw ?? '');
      if (s.length > 2000) return { ok: false, error: 'Слишком длинное значение' };
      return { ok: true, value: s };
    }
  }
}
