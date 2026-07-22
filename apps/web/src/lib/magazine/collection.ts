// ════════════════════════════════════════════════════════════
// Character IP «Semurg va do'stlari» — FRESH WEEKLY
// Узбекская магия: жар-птица Семург, дух граната Анор, соловей
// Булбул, дух самовара Чой-бобо, ковёр-самолёт Гилам, росток Нихол.
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
    // Флагман бренда — мифическая жар-птица Семург (renaissance, счастье)
    id: 'semurg', name: 'Семург', nameUz: 'Semurg', emoji: '🦚',
    desc: 'Легендарная жар-птица Шёлкового пути. Её крылья зажигают рассвет над Самаркандом.',
    descUz: 'Ipak yo‘lining afsonaviy semurg qushi. Uning qanotlari Samarqand tongini yoqadi.',
    bonus: 'Золотой урожай ×2', bonusValue: 100, bonusType: 'auto',
    rarity: 'legendary', color: '#0F6B4F', glowColor: '#E4C98C',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Flamingo/glTF-Binary/Flamingo.glb',
    modelScale: '0.08 0.08 0.08', modelRotation: '0 180 0',
  },
  {
    // Дух граната — нацфрукт, щедрость и тепло
    id: 'anor', name: 'Анор', nameUz: 'Anor', emoji: '❤️',
    desc: 'Дух граната. Дарит щедрость: где смеётся Анор — там богатый стол.',
    descUz: 'Anor ruhi. Saxovat ulashadi: Anor kulgan joyda dasturxon to‘kin.',
    bonus: '+20% урожай', bonusValue: 20, bonusType: 'yield',
    rarity: 'rare', color: '#B4232B', glowColor: '#F0A0A0',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Avocado/glTF-Binary/Avocado.glb',
    modelScale: '3 3 3', modelRotation: '0 0 0',
  },
  {
    // Соловей-сказитель — ведёт сказки и загадки
    id: 'bulbul', name: 'Булбул', nameUz: 'Bulbul', emoji: '🐦',
    desc: 'Соловей-сказитель. Его песня превращает вечер в волшебную историю.',
    descUz: 'Bulbul — ertakchi. Uning qo‘shig‘i oqshomni sehrli ertakka aylantiradi.',
    bonus: 'Качество ×2', bonusValue: 100, bonusType: 'quality',
    rarity: 'common', color: '#1E6F9F', glowColor: '#7FD4E4',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Parrot/glTF-Binary/Parrot.glb',
    modelScale: '0.1 0.1 0.1', modelRotation: '0 180 0',
  },
  {
    // Дух самовара — уют, «дедушка», дом
    id: 'choybobo', name: 'Чой-бобо', nameUz: 'Choy-bobo', emoji: '🫖',
    desc: 'Дух самовара. Согревает дом и знает тысячу историй у пиалы чая.',
    descUz: 'Samovar ruhi. Uyni isitadi va bir piyola choy yonida ming ertak biladi.',
    bonus: 'Тёплый щит', bonusValue: 100, bonusType: 'shield',
    rarity: 'rare', color: '#B07A2E', glowColor: '#E9C98A',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
    modelScale: '3 3 3', modelRotation: '0 0 0',
  },
  {
    // Ковёр-самолёт — Шёлковый путь, авантюра, озорной голос бота
    id: 'gilam', name: 'Гилам', nameUz: 'Gilam', emoji: '🪄',
    desc: 'Ковёр-самолёт с узором сюзане. Летит на край света за самым вкусным.',
    descUz: 'Suzani naqshli gilam-samolyot. Eng mazali taom uchun dunyoning chetiga uchadi.',
    bonus: 'Доставка ×2', bonusValue: 100, bonusType: 'delivery',
    rarity: 'rare', color: '#7C3AED', glowColor: '#C4A0F0',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Carbon/glTF-Binary/Carbon.glb',
    modelScale: '1 1 1', modelRotation: '0 0 0',
  },
  {
    // Волшебный росток — «каждый-ребёнок», стартовый герой (ре-дизайн «Росточка»)
    id: 'nihol', name: 'Нихол', nameUz: 'Nihol', emoji: '🌱',
    desc: 'Любопытный волшебный росток. Мечтает попасть на самую красивую тарелку города.',
    descUz: 'Qiziquvchan sehrli nihol. Shahardagi eng chiroyli laganga tushishni orzu qiladi.',
    bonus: 'Магия роста +20%', bonusValue: 20, bonusType: 'speed',
    rarity: 'common', color: '#5AA54F', glowColor: '#C9E9A8',
    modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Lantern/glTF-Binary/Lantern.glb',
    modelScale: '0.06 0.06 0.06', modelRotation: '0 0 0',
  },
];

// Миграция коллекций гостей: старые «Агро Друзья» → новый каст «Semurg va do'stlari».
const LEGACY_ID_MAP: Record<string, string> = {
  tomi: 'nihol', brok: 'choybobo', yagodka: 'anor',
  robo: 'semurg', listo: 'bulbul', trak: 'gilam',
};

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
    // Миграция 1: старый формат — просто массив id-шек
    let entries: CollectionEntry[];
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      entries = parsed.map((id: string) => ({
        charId: id, unlockedAt: new Date().toISOString(), source: 'ar' as const,
      }));
    } else if (Array.isArray(parsed)) {
      entries = parsed as CollectionEntry[];
    } else {
      return [];
    }
    // Миграция 2: старые «Агро Друзья» → новый каст (с дедупликацией)
    const seen = new Set<string>();
    const remapped = entries.reduce<CollectionEntry[]>((acc, e) => {
      const charId = LEGACY_ID_MAP[e.charId] ?? e.charId;
      if (seen.has(charId)) return acc;
      seen.add(charId);
      acc.push({ ...e, charId });
      return acc;
    }, []);
    if (JSON.stringify(remapped) !== raw) {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(remapped));
    }
    return remapped;
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
