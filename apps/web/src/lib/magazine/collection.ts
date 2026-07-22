// ════════════════════════════════════════════════════════════
// Система коллекционирования «Агро Друзья» — FRESH WEEKLY
// localStorage-based для гостей (без регистрации).
// Интеграция: AR Viewer ↔ Farm Simulator ↔ Паспорт Агронома
// ════════════════════════════════════════════════════════════

export type Rarity = 'common' | 'rare' | 'legendary';

export interface CollectionCharacter {
  id: string;
  name: string;
  nameUz: string;
  emoji: string;
  desc: string;
  descUz: string;
  bonus: string;
  bonusValue: number;     // числовой бонус для Farm Simulator
  bonusType: 'yield' | 'speed' | 'shield' | 'quality' | 'delivery' | 'auto';
  rarity: Rarity;
  color: string;
  glowColor: string;
  modelUrl: string;
  modelScale: string;
  modelRotation: string;
}

export const CHARACTERS: CollectionCharacter[] = [
  {
    id: 'tomi', name: 'Томи', nameUz: 'Tomi', emoji: '🍅',
    desc: 'Главный фермер Агроферми. Знает секрет идеального урожая.',
    descUz: 'Agrofermaning bosh fermeri. Ideal hosilning sirini biladi.',
    bonus: '+15% урожай', bonusValue: 15, bonusType: 'yield',
    rarity: 'common', color: '#ef4444', glowColor: '#fca5a5',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Avocado/glTF-Binary/Avocado.glb',
    modelScale: '3 3 3', modelRotation: '90 0 0',
  },
  {
    id: 'brok', name: 'Брок', nameUz: 'Brok', emoji: '🥦',
    desc: 'Несокрушимый защитник. Ни один вредитель не пройдёт.',
    descUz: 'Yengilmas himoyachi. Birorta zararkunanda o\'tmaydi.',
    bonus: 'Щит от вредителей', bonusValue: 100, bonusType: 'shield',
    rarity: 'common', color: '#22c55e', glowColor: '#86efac',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Fox/glTF-Binary/Fox.glb',
    modelScale: '0.02 0.02 0.02', modelRotation: '0 0 0',
  },
  {
    id: 'yagodka', name: 'Ягодка', nameUz: 'Yagodka', emoji: '🍓',
    desc: 'Фея урожая. Её магия ускоряет рост любого растения.',
    descUz: 'Hosil perisi. Uning sehri har qanday o\'simlikning o\'sishini tezlashtiradi.',
    bonus: 'Магия роста +20%', bonusValue: 20, bonusType: 'speed',
    rarity: 'rare', color: '#ec4899', glowColor: '#f9a8d4',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Lantern/glTF-Binary/Lantern.glb',
    modelScale: '0.06 0.06 0.06', modelRotation: '0 0 0',
  },
  {
    id: 'robo', name: 'Робо', nameUz: 'Robo', emoji: '🤖',
    desc: 'Неустанный робот-сборщик. Работает 24/7 без перерывов.',
    descUz: 'Charchanmaydigan robot-yig\'uvchi. 24/7 ishlaydi.',
    bonus: 'Авто-сбор 24/7', bonusValue: 100, bonusType: 'auto',
    rarity: 'rare', color: '#3b82f6', glowColor: '#93c5fd',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/BoxAnimated/glTF-Binary/BoxAnimated.glb',
    modelScale: '0.25 0.25 0.25', modelRotation: '0 0 0',
  },
  {
    id: 'listo', name: 'Листо', nameUz: 'Listo', emoji: '🍃',
    desc: 'Самурай качества. Срезает только идеальные ростки.',
    descUz: 'Sifat samurayi. Faqat ideal novdalarni kesadi.',
    bonus: 'Качество ×2', bonusValue: 100, bonusType: 'quality',
    rarity: 'common', color: '#10b981', glowColor: '#6ee7b7',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Duck/glTF-Binary/Duck.glb',
    modelScale: '0.25 0.25 0.25', modelRotation: '0 0 0',
  },
  {
    id: 'trak', name: 'Трак', nameUz: 'Trak', emoji: '🚜',
    desc: 'Мастер логистики. Доставит урожай вдвое быстрее.',
    descUz: 'Logistika ustasi. Hosilni ikki barobar tez yetkazadi.',
    bonus: 'Доставка ×2', bonusValue: 100, bonusType: 'delivery',
    rarity: 'legendary', color: '#f59e0b', glowColor: '#fcd34d',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
    modelScale: '0.15 0.15 0.15', modelRotation: '0 0 0',
  },
];

export const RARITY_LABELS: Record<Rarity, { ru: string; uz: string }> = {
  common: { ru: 'Обычная', uz: 'Oddiy' },
  rare: { ru: 'Редкая', uz: 'Noyob' },
  legendary: { ru: 'Легендарная', uz: 'Afsonaviy' },
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  rare: '#8b5cf6',
  legendary: '#f59e0b',
};

// ── Хранилище коллекции (localStorage) ──

const COLLECTION_KEY = 'fw_ar_collected';

export interface CollectionEntry {
  charId: string;
  unlockedAt: string;  // ISO date
  source: 'ar' | 'game' | 'event';
}

export function loadCollection(): CollectionEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Миграция: старый формат — просто массив id-шек
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated: CollectionEntry[] = parsed.map((id: string) => ({
        charId: id, unlockedAt: new Date().toISOString(), source: 'ar' as const,
      }));
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return parsed;
  } catch { return []; }
}

export function saveCollection(entries: CollectionEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(entries));
    // Обратная совместимость: AR viewer читает Set<string>
    // Нет нужды — AR viewer использует тот же ключ
  } catch { /* ok */ }
}

export function addToCollection(charId: string, source: CollectionEntry['source'] = 'ar'): CollectionEntry[] {
  const entries = loadCollection();
  if (entries.some(e => e.charId === charId)) return entries;
  const next = [...entries, { charId, unlockedAt: new Date().toISOString(), source }];
  saveCollection(next);
  return next;
}

export function isCollected(charId: string): boolean {
  return loadCollection().some(e => e.charId === charId);
}

export function collectionProgress(): { collected: number; total: number; percent: number } {
  const collected = loadCollection().length;
  const total = CHARACTERS.length;
  return { collected, total, percent: Math.round((collected / total) * 100) };
}

export function characterById(id: string): CollectionCharacter | undefined {
  return CHARACTERS.find(c => c.id === id);
}

// Для Farm Simulator: список бонусов от разблокированных персонажей
export function activeCompanionBonuses(): { type: CollectionCharacter['bonusType']; value: number; charId: string }[] {
  const entries = loadCollection();
  return entries
    .map(e => characterById(e.charId))
    .filter((c): c is CollectionCharacter => c !== undefined)
    .map(c => ({ type: c.bonusType, value: c.bonusValue, charId: c.id }));
}
