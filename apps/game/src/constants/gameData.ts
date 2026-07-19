import type { GameState, UpgradeCard } from '../types/game';

export const LEVELS = [
  { name: 'Новичок', min: 0, icon: '🌱' },
  { name: 'Садовник', min: 5000, icon: '🌿' },
  { name: 'Фермер', min: 25000, icon: '🌾' },
  { name: 'Агроном', min: 100000, icon: '🧑‍🌾' },
  { name: 'Управляющий', min: 500000, icon: '🏭' },
  { name: 'Легенда', min: 2000000, icon: '👑' },
  { name: 'Император', min: 10000000, icon: '🌟' },
];

export const UPGRADE_CARDS: UpgradeCard[] = [
  // Seeds — Семена
  { id: 'microgreens', name: 'Микрозелень', emoji: '🌱', category: 'seeds', description: 'Базовая культура', baseCost: 500, level: 0, maxLevel: 20, profitPerHour: 50 },
  { id: 'basil', name: 'Базилик', emoji: '🌿', category: 'seeds', description: 'Ароматная зелень', baseCost: 1500, level: 0, maxLevel: 20, profitPerHour: 120 },
  { id: 'arugula', name: 'Руккола', emoji: '🥬', category: 'seeds', description: 'Растёт 7 дней', baseCost: 3000, level: 0, maxLevel: 15, profitPerHour: 280 },
  { id: 'sunflower', name: 'Подсолнух', emoji: '🌻', category: 'seeds', description: 'Мощный росток', baseCost: 8000, level: 0, maxLevel: 15, profitPerHour: 600 },
  { id: 'peas', name: 'Горох', emoji: '🫛', category: 'seeds', description: 'Премиум культура', baseCost: 20000, level: 0, maxLevel: 10, profitPerHour: 1500 },
  { id: 'wheatgrass', name: 'Витграсс', emoji: '🍀', category: 'seeds', description: 'Суперфуд!', baseCost: 50000, level: 0, maxLevel: 10, profitPerHour: 3500 },

  // Equipment — Техника
  { id: 'led_light', name: 'LED Лампа', emoji: '💡', category: 'equipment', description: 'Свет для роста', baseCost: 2000, level: 0, maxLevel: 15, profitPerHour: 150 },
  { id: 'hydroponic', name: 'Гидропоника', emoji: '💧', category: 'equipment', description: 'Без почвы!', baseCost: 5000, level: 0, maxLevel: 15, profitPerHour: 350 },
  { id: 'greenhouse', name: 'Теплица', emoji: '🏠', category: 'equipment', description: 'Круглый год', baseCost: 15000, level: 0, maxLevel: 10, profitPerHour: 900 },
  { id: 'autowatering', name: 'Авто-полив', emoji: '🚿', category: 'equipment', description: 'Автоматика', baseCost: 30000, level: 0, maxLevel: 10, profitPerHour: 2000 },
  { id: 'climate', name: 'Климат-контроль', emoji: '🌡️', category: 'equipment', description: 'Идеальная среда', baseCost: 80000, level: 0, maxLevel: 8, profitPerHour: 5000 },

  // Team — Команда
  { id: 'gardener', name: 'Садовник', emoji: '👨‍🌾', category: 'team', description: 'Первый помощник', baseCost: 3000, level: 0, maxLevel: 10, profitPerHour: 200 },
  { id: 'agronomist', name: 'Агроном', emoji: '🧑‍🔬', category: 'team', description: 'Наука урожая', baseCost: 10000, level: 0, maxLevel: 10, profitPerHour: 700 },
  { id: 'driver', name: 'Курьер', emoji: '🚚', category: 'team', description: 'Доставка', baseCost: 25000, level: 0, maxLevel: 8, profitPerHour: 1800 },
  { id: 'marketer', name: 'Маркетолог', emoji: '📢', category: 'team', description: 'Продвижение', baseCost: 50000, level: 0, maxLevel: 8, profitPerHour: 3000 },

  // Special — Особое
  { id: 'bazaar', name: 'Точка на базаре', emoji: '🏪', category: 'special', description: 'Чорсу базар!', baseCost: 40000, level: 0, maxLevel: 5, profitPerHour: 4000 },
  { id: 'restaurant', name: 'Ресторан-партнёр', emoji: '🍽️', category: 'special', description: 'B2B контракт', baseCost: 100000, level: 0, maxLevel: 5, profitPerHour: 8000 },
  { id: 'export', name: 'Экспорт', emoji: '✈️', category: 'special', description: 'За рубеж!', baseCost: 250000, level: 0, maxLevel: 3, profitPerHour: 20000 },
  { id: 'brand', name: 'Свой бренд', emoji: '⭐', category: 'special', description: 'Империя!', baseCost: 500000, level: 0, maxLevel: 3, profitPerHour: 50000 },

  // Companions — «Агро Друзья» (3D-персонажи из журнала FRESH WEEKLY)
  { id: 'tomi', name: 'Томи', emoji: '🍅', category: 'companions', description: 'Фермер +15% урожай', baseCost: 8000, level: 0, maxLevel: 5, profitPerHour: 700 },
  { id: 'brok', name: 'Брок', emoji: '🥦', category: 'companions', description: 'Щит от вредителей', baseCost: 15000, level: 0, maxLevel: 5, profitPerHour: 1200 },
  { id: 'yagodka', name: 'Ягодка', emoji: '🍓', category: 'companions', description: 'Магия роста +20%', baseCost: 25000, level: 0, maxLevel: 5, profitPerHour: 2000 },
  { id: 'robo', name: 'Робо', emoji: '🤖', category: 'companions', description: 'Авто-сбор 24/7', baseCost: 60000, level: 0, maxLevel: 3, profitPerHour: 6000 },
  { id: 'trak', name: 'Трак', emoji: '🚜', category: 'companions', description: 'Доставка x2', baseCost: 120000, level: 0, maxLevel: 3, profitPerHour: 12000 },
  { id: 'listo', name: 'Листо', emoji: '🍃', category: 'companions', description: 'Самурай качества', baseCost: 200000, level: 0, maxLevel: 3, profitPerHour: 25000 },
];

export const getDailyCombo = (): string[] => {
  const combos = [
    ['basil', 'greenhouse', 'bazaar'],
    ['microgreens', 'led_light', 'gardener'],
    ['arugula', 'hydroponic', 'restaurant'],
    ['sunflower', 'autowatering', 'agronomist'],
    ['peas', 'climate', 'export'],
    ['wheatgrass', 'greenhouse', 'brand'],
    ['basil', 'led_light', 'bazaar'],
  ];
  const dayOfWeek = new Date().getDay();
  return combos[dayOfWeek];
};

export const getToday = () => new Date().toISOString().split('T')[0];

export const INITIAL_STATE: GameState = {
  balance: 0,
  totalEarned: 0,
  profitPerHour: 0,
  level: 0,
  energy: 1000,
  maxEnergy: 1000,
  coinsPerTap: 1,
  lastOnline: Date.now(),
  upgrades: {},
  dailyCombo: [],
  dailyComboSolved: false,
  dailyComboDate: '',
  friends: 0,
  streak: 0,
  lastDaily: '',
  totalTaps: 0,
  totalUpgrades: 0,
  dailyTasksClaimed: {},
  socialTasksClaimed: {},
  streakClaimed: false,
};

export const DAILY_TASKS = [
  { id: 'taps500', title: 'Тапнуть 500 раз', reward: 5000, emoji: '👆', check: (g: GameState) => g.totalTaps >= 500 },
  { id: 'upgrades3', title: 'Улучшить 3 карточки', reward: 10000, emoji: '⬆️', check: (g: GameState) => g.totalUpgrades >= 3 },
  { id: 'earn10k', title: 'Заработать 10,000', reward: 3000, emoji: '💰', check: (g: GameState) => g.totalEarned >= 10000 },
  { id: 'energy0', title: 'Потратить всю энергию', reward: 2000, emoji: '⚡', check: (g: GameState) => g.energy <= 10 },
];

export const SOCIAL_TASKS = [
  { id: 'channel', title: 'Подписка на канал', reward: 10000, emoji: '📢', link: 'https://t.me/MicrogreenUzbekistan' },
  { id: 'instagram', title: 'Подписка в Instagram', reward: 10000, emoji: '📸', link: 'https://instagram.com/microgreenuzbekistan' },
  { id: 'website', title: 'Посетить сайт', reward: 5000, emoji: '🌐', link: 'https://microgreenuzbekistan.com' },
];
