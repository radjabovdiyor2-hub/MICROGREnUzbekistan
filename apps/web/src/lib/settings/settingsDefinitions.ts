export type SettingType = 'number' | 'money' | 'string' | 'text' | 'boolean' | 'list';

export interface SettingDef {
  /** Группа во вкладке настроек. */
  category: SettingCategory;
  type: SettingType;
  default: number | string | boolean | string[];
  labelRu: string;
  labelUz: string;
  /** Короткое пояснение: что сломается, если поставить не то. */
  hintRu?: string;
  min?: number;
  max?: number;
  /** Настройка уходит в публичный /api/config (сайт + магазинный бот). */
  publicKey?: boolean;
}

export const SETTING_CATEGORIES = [
  'delivery',
  'contacts',
  'content',
  'bonus',
  'loyalty',
  'stock',
  'payment',
  'ai',
  'magazine',
] as const;

export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SettingCategory, { ru: string; uz: string }> = {
  delivery: { ru: 'Доставка', uz: 'Yetkazib berish' },
  contacts: { ru: 'Контакты и соцсети', uz: 'Kontaktlar' },
  content: { ru: 'Тексты на сайте', uz: 'Sayt matnlari' },
  bonus: { ru: 'Бонусы и рефералы', uz: 'Bonuslar' },
  loyalty: { ru: 'Лояльность HoReCa', uz: 'HoReCa sodiqlik' },
  stock: { ru: 'Склад и пороги', uz: 'Ombor' },
  payment: { ru: 'Оплата', uz: "To'lov" },
  ai: { ru: 'ИИ и бюджет', uz: 'AI va byudjet' },
  magazine: { ru: 'Журнал и печать', uz: 'Jurnal' },
};

export { SETTINGS, type SettingKey } from './settingsData';
