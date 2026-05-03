import { useState, useEffect, useCallback, useRef } from 'react';
// framer-motion removed — using CSS animations for better bundle size
import {
  Zap, Trophy, Star, TrendingUp, Users, Gift,
  Sprout, ChevronRight, Lock, Flame, Clock, Award, Check, Copy
} from 'lucide-react';
import './App.css';
import WebApp from '@twa-dev/sdk';

// ==================== SERVER SYNC ====================
const API_URL = 'https://microgreenuzbekistan.com/api';

function getTelegramId(): number | null {
  try {
    const user = WebApp.initDataUnsafe?.user;
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function getTelegramName(): string {
  try {
    const user = WebApp.initDataUnsafe?.user;
    return user?.first_name || user?.username || 'Player';
  } catch {
    return 'Player';
  }
}

// ==================== TYPES ====================
type Tab = 'farm' | 'upgrade' | 'friends' | 'earn' | 'bonus';

interface UpgradeCard {
  id: string;
  name: string;
  emoji: string;
  category: 'seeds' | 'equipment' | 'team' | 'special';
  description: string;
  baseCost: number;
  level: number;
  maxLevel: number;
  profitPerHour: number;
  requirement?: string;
}

interface GameState {
  balance: number;
  totalEarned: number;
  profitPerHour: number;
  level: number;
  energy: number;
  maxEnergy: number;
  coinsPerTap: number;
  lastOnline: number;
  upgrades: Record<string, number>;
  dailyCombo: string[];
  dailyComboSolved: boolean;
  dailyComboDate: string;
  friends: number;
  streak: number;
  lastDaily: string;
  // Task tracking
  totalTaps: number;
  totalUpgrades: number;
  dailyTasksClaimed: Record<string, boolean>;
  socialTasksClaimed: Record<string, boolean>;
  streakClaimed: boolean;
}

// ==================== GAME DATA ====================
const LEVELS = [
  { name: 'Новичок', min: 0, icon: '🌱' },
  { name: 'Садовник', min: 5000, icon: '🌿' },
  { name: 'Фермер', min: 25000, icon: '🌾' },
  { name: 'Агроном', min: 100000, icon: '🧑‍🌾' },
  { name: 'Управляющий', min: 500000, icon: '🏭' },
  { name: 'Легенда', min: 2000000, icon: '👑' },
  { name: 'Император', min: 10000000, icon: '🌟' },
];

const UPGRADE_CARDS: UpgradeCard[] = [
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
];

// Daily combo — changes daily based on date
const getDailyCombo = (): string[] => {
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

const getToday = () => new Date().toISOString().split('T')[0];

const INITIAL_STATE: GameState = {
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

// Daily tasks definition
const DAILY_TASKS = [
  { id: 'taps500', title: 'Тапнуть 500 раз', reward: 5000, emoji: '👆', check: (g: GameState) => g.totalTaps >= 500 },
  { id: 'upgrades3', title: 'Улучшить 3 карточки', reward: 10000, emoji: '⬆️', check: (g: GameState) => g.totalUpgrades >= 3 },
  { id: 'earn10k', title: 'Заработать 10,000', reward: 3000, emoji: '💰', check: (g: GameState) => g.totalEarned >= 10000 },
  { id: 'energy0', title: 'Потратить всю энергию', reward: 2000, emoji: '⚡', check: (g: GameState) => g.energy <= 10 },
];

const SOCIAL_TASKS = [
  { id: 'channel', title: 'Подписка на канал', reward: 10000, emoji: '📢', link: 'https://t.me/MicrogreenUzbekistan' },
  { id: 'instagram', title: 'Подписка в Instagram', reward: 10000, emoji: '📸', link: 'https://instagram.com/microgreenuzbekistan' },
  { id: 'website', title: 'Посетить сайт', reward: 5000, emoji: '🌐', link: 'https://microgreenuzbekistan.com' },
];

// ==================== MAIN APP ====================
function App() {
  const [tab, setTab] = useState<Tab>('farm');
  const [game, setGame] = useState<GameState>(() => {
    const saved = localStorage.getItem('greenfarm_v3');
    if (saved) {
      const parsed = JSON.parse(saved);
      const state = { ...INITIAL_STATE, ...parsed };
      // Reset daily state if new day
      const today = getToday();
      if (state.lastDaily !== today) {
        state.totalTaps = 0;
        state.totalUpgrades = 0;
        state.dailyTasksClaimed = {};
        state.streakClaimed = false;
        if (state.dailyComboDate !== today) {
          state.dailyCombo = [];
          state.dailyComboSolved = false;
          state.dailyComboDate = today;
        }
      }
      return state;
    }
    return { ...INITIAL_STATE, dailyComboDate: getToday() };
  });
  const [clicks, setClicks] = useState<{ id: number; x: number; y: number; val: number }[]>([]);
  const [upgradeCategory, setUpgradeCategory] = useState<UpgradeCard['category']>('seeds');
  const [showOffline, setShowOffline] = useState(false);
  const [offlineEarnings, setOfflineEarnings] = useState(0);
  const [showToast, setShowToast] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const clickId = useRef(0);

  // Calculate profit per hour
  const calcPPH = useCallback((upgrades: Record<string, number>) => {
    let pph = 0;
    UPGRADE_CARDS.forEach(card => {
      const level = upgrades[card.id] || 0;
      if (level > 0) pph += card.profitPerHour * level;
    });
    return pph;
  }, []);

  // Calculate level
  const calcLevel = useCallback((total: number) => {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (total >= LEVELS[i].min) return i;
    }
    return 0;
  }, []);

  // Offline earnings on load
  useEffect(() => {
    const pph = calcPPH(game.upgrades);
    const offlineMs = Date.now() - game.lastOnline;
    const offlineHours = Math.min(offlineMs / 3600000, 3);
    const earned = Math.floor(pph * offlineHours);
    if (earned > 100) {
      setOfflineEarnings(earned);
      setShowOffline(true);
      setGame(g => ({
        ...g,
        balance: g.balance + earned,
        totalEarned: g.totalEarned + earned,
        profitPerHour: pph,
        level: calcLevel(g.totalEarned + earned),
      }));
    }
  }, []); // eslint-disable-line

  // Passive income tick every 2 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setGame(g => {
        const pph = calcPPH(g.upgrades);
        const increment = Math.floor(pph / 1800);
        if (increment <= 0) return g;
        return {
          ...g,
          balance: g.balance + increment,
          totalEarned: g.totalEarned + increment,
          profitPerHour: pph,
          level: calcLevel(g.totalEarned + increment),
        };
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [calcPPH, calcLevel]);

  // Energy regen: +3 per second
  useEffect(() => {
    const timer = setInterval(() => {
      setGame(g => ({ ...g, energy: Math.min(g.energy + 3, g.maxEnergy) }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Save to localStorage
  useEffect(() => {
    const save = { ...game, lastOnline: Date.now() };
    localStorage.setItem('greenfarm_v3', JSON.stringify(save));
  }, [game]);

  // ===== SERVER SYNC =====
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<string>('');

  // Save game state to server
  const saveToServer = useCallback(async (state: GameState) => {
    const telegramId = getTelegramId();
    if (!telegramId) return;

    // Quick hash to avoid redundant saves
    const hash = `${state.balance}-${state.energy}-${state.totalTaps}-${state.streak}`;
    if (hash === lastSyncRef.current) return;
    lastSyncRef.current = hash;

    try {
      await fetch(`${API_URL}/game/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId,
          name: getTelegramName(),
          ecoPoints: state.balance,
          level: state.level,
          energy: state.energy,
          totalTaps: state.totalTaps,
          streak: state.streak,
        }),
      });
    } catch (e) {
      console.warn('[Sync] Save failed:', e);
    }
  }, []);

  // Load game state from server on init
  useEffect(() => {
    const telegramId = getTelegramId();
    if (!telegramId) return;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/game/save?telegramId=${telegramId}`);
        if (!res.ok) return;
        const data = await res.json();
        const serverState = data.gameState;
        if (!serverState) return;

        // Merge: take whichever has higher balance (server or local)
        setGame(local => {
          if (serverState.ecoPoints > local.balance) {
            return {
              ...local,
              balance: serverState.ecoPoints,
              totalEarned: Math.max(local.totalEarned, serverState.ecoPoints),
              level: Math.max(local.level, serverState.level || 0),
              streak: Math.max(local.streak, serverState.streak || 0),
            };
          }
          return local;
        });
      } catch (e) {
        console.warn('[Sync] Load failed:', e);
      }
    })();
  }, []); // eslint-disable-line

  // Auto-save every 30 seconds
  useEffect(() => {
    syncTimerRef.current = setInterval(() => {
      saveToServer(game);
    }, 30000);
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [game, saveToServer]);

  // Save on page hide (tab switch / close)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const telegramId = getTelegramId();
        if (!telegramId) return;
        // Use sendBeacon for reliability on close
        const payload = JSON.stringify({
          telegramId,
          name: getTelegramName(),
          ecoPoints: game.balance,
          level: game.level,
          energy: game.energy,
          totalTaps: game.totalTaps,
          streak: game.streak,
        });
        navigator.sendBeacon(`${API_URL}/game/save`, new Blob([payload], { type: 'application/json' }));
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [game]);

  // Toast auto-hide
  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(''), 2500);
    return () => clearTimeout(t);
  }, [showToast]);

  // Haptic
  const haptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    try { WebApp.HapticFeedback.impactOccurred(type); } catch { /* */ }
  };

  const toast = (msg: string) => {
    setShowToast(msg);
    haptic('medium');
  };

  // ==================== TAP ====================
  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (game.energy < game.coinsPerTap) return;
    haptic('light');

    const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0]?.clientY;
    const earned = game.coinsPerTap;

    setGame(g => ({
      ...g,
      balance: g.balance + earned,
      totalEarned: g.totalEarned + earned,
      energy: g.energy - earned,
      totalTaps: g.totalTaps + 1,
      level: calcLevel(g.totalEarned + earned),
    }));

    const id = clickId.current++;
    setClicks(prev => [...prev, { id, x: clientX, y: clientY, val: earned }]);
    setTimeout(() => setClicks(prev => prev.filter(c => c.id !== id)), 700);
  };

  // ==================== UPGRADE ====================
  const getUpgradeCost = (card: UpgradeCard) => {
    const level = game.upgrades[card.id] || 0;
    return Math.floor(card.baseCost * Math.pow(1.5, level));
  };

  const upgradeCard = (card: UpgradeCard) => {
    const level = game.upgrades[card.id] || 0;
    if (level >= card.maxLevel) return;
    const cost = getUpgradeCost(card);
    if (game.balance < cost) return;
    haptic('medium');

    const todayCombo = getDailyCombo();

    setGame(g => {
      const newUpgrades = { ...g.upgrades, [card.id]: (g.upgrades[card.id] || 0) + 1 };
      const newPPH = calcPPH(newUpgrades);
      let newCombo = [...g.dailyCombo];
      if (!newCombo.includes(card.id) && todayCombo.includes(card.id)) {
        newCombo.push(card.id);
      }
      const comboSolved = !g.dailyComboSolved && todayCombo.every(id => newCombo.includes(id));
      if (comboSolved) toast('🎉 Комбо собрано! +5,000,000 🌱');

      return {
        ...g,
        balance: g.balance - cost + (comboSolved ? 5000000 : 0),
        totalEarned: g.totalEarned + (comboSolved ? 5000000 : 0),
        upgrades: newUpgrades,
        profitPerHour: newPPH,
        coinsPerTap: Math.max(1, Math.floor(newPPH / 500) + 1),
        maxEnergy: 1000 + Math.floor(newPPH / 10),
        dailyCombo: newCombo,
        dailyComboSolved: g.dailyComboSolved || comboSolved,
        totalUpgrades: g.totalUpgrades + 1,
      };
    });
  };

  // ==================== DAILY STREAK ====================
  const claimStreak = () => {
    const today = getToday();
    if (game.streakClaimed) return;
    const reward = 2000 * (game.streak + 1);

    // Check if consecutive day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const isConsecutive = game.lastDaily === yesterdayStr || game.lastDaily === '';
    const newStreak = isConsecutive ? Math.min(game.streak + 1, 7) : 1;

    setGame(g => ({
      ...g,
      balance: g.balance + reward,
      totalEarned: g.totalEarned + reward,
      streak: newStreak,
      lastDaily: today,
      streakClaimed: true,
      level: calcLevel(g.totalEarned + reward),
    }));
    toast(`🔥 День ${newStreak}! +${formatNum(reward)} 🌱`);
  };

  // ==================== CLAIM DAILY TASK ====================
  const claimDailyTask = (taskId: string, reward: number) => {
    if (game.dailyTasksClaimed[taskId]) return;
    setGame(g => ({
      ...g,
      balance: g.balance + reward,
      totalEarned: g.totalEarned + reward,
      dailyTasksClaimed: { ...g.dailyTasksClaimed, [taskId]: true },
      level: calcLevel(g.totalEarned + reward),
    }));
    toast(`✅ Задание выполнено! +${formatNum(reward)} 🌱`);
  };

  // ==================== CLAIM SOCIAL TASK ====================
  const claimSocialTask = (taskId: string, reward: number, link: string) => {
    if (game.socialTasksClaimed[taskId]) return;
    // Open link first
    try { window.open(link, '_blank'); } catch { /* */ }
    // Give reward after 1 second (simulates verification)
    setTimeout(() => {
      setGame(g => ({
        ...g,
        balance: g.balance + reward,
        totalEarned: g.totalEarned + reward,
        socialTasksClaimed: { ...g.socialTasksClaimed, [taskId]: true },
        level: calcLevel(g.totalEarned + reward),
      }));
      toast(`✅ +${formatNum(reward)} 🌱`);
    }, 1000);
  };

  // ==================== COPY LINK ====================
  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText('https://t.me/Microgreenuzbekistan_bot/game');
      setCopiedLink(true);
      haptic('light');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* */ }
  };

  // ==================== HELPERS ====================
  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  const currentLevel = LEVELS[game.level] || LEVELS[0];
  const nextLevel = LEVELS[game.level + 1];
  const progress = nextLevel ? Math.min(100, (game.totalEarned / nextLevel.min) * 100) : 100;
  const todayCombo = getDailyCombo();

  // ==================== RENDER ====================
  return (
    <div className="app-container">
      {/* Toast notification */}
      {showToast && (
        <div className="toast toast-enter">
          {showToast}
        </div>
      )}

      {/* Offline Earnings Modal */}
      {showOffline && (
        <div className="modal-overlay modal-enter">
          <div className="modal-card modal-card-enter">
            <Clock size={48} className="modal-icon" />
            <h2>Пока вас не было...</h2>
            <p className="modal-subtitle">Ваша ферма заработала</p>
            <p className="modal-amount">+{formatNum(offlineEarnings)} 🌱</p>
            <button className="btn-primary large" onClick={() => setShowOffline(false)}>Забрать!</button>
          </div>
        </div>
      )}

      {/* ===== FARM TAB ===== */}
      {tab === 'farm' && (
        <div className="tab-content">
          <div className="farm-header">
            <div className="level-badge">
              <span className="level-icon">{currentLevel.icon}</span>
              <div>
                <p className="level-name">{currentLevel.name}</p>
                <div className="level-bar">
                  <div className="level-bar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            <div className="pph-badge">
              <TrendingUp size={14} />
              <span>+{formatNum(game.profitPerHour)}/час</span>
            </div>
          </div>

          <div className="balance-display">
            <span className="balance-coin">🌱</span>
            <span className="balance-amount">{game.balance.toLocaleString()}</span>
          </div>

          <div className="tap-area">
            <div
              onPointerDown={handleTap}
              className="tap-button tap-pressable"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            >
              <div className="tap-glow" />
              <div className="tap-circle">
                <div className="tap-inner">
                  <span className="tap-emoji">🌿</span>
                </div>
              </div>
            </div>

            {clicks.map(c => (
              <div
                key={c.id}
                className="float-number float-up"
                style={{ left: c.x, top: c.y }}
              >
                +{c.val}
              </div>
            ))}
          </div>

          <div className="energy-bar-container">
            <div className="energy-info">
              <Zap size={16} className="icon-yellow" />
              <span className="energy-text">{game.energy}/{game.maxEnergy}</span>
            </div>
            <div className="energy-track">
              <div className="energy-fill" style={{ width: `${(game.energy / game.maxEnergy) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ===== UPGRADE TAB ===== */}
      {tab === 'upgrade' && (
        <div className="tab-content">
          {/* Daily Combo */}
          <div className="daily-combo-section">
            <div className="combo-header">
              <h3><Flame size={16} /> Ежедневное комбо</h3>
              <span className="combo-reward">+5,000,000 🌱</span>
            </div>
            <div className="combo-slots">
              {[0, 1, 2].map(i => {
                const found = game.dailyCombo[i];
                return (
                  <div key={i} className={`combo-slot ${found ? 'found' : ''}`}>
                    {found
                      ? UPGRADE_CARDS.find(c => c.id === found)?.emoji || '?'
                      : '?'
                    }
                  </div>
                );
              })}
            </div>
            {game.dailyComboSolved && <p className="combo-solved">✅ Комбо собрано!</p>}
            {!game.dailyComboSolved && <p className="combo-hint">Улучшите нужные 3 карточки чтобы получить бонус!</p>}
          </div>

          {/* Category Tabs */}
          <div className="category-tabs">
            {(['seeds', 'equipment', 'team', 'special'] as const).map(cat => (
              <button
                key={cat}
                className={`cat-tab ${upgradeCategory === cat ? 'active' : ''}`}
                onClick={() => setUpgradeCategory(cat)}
              >
                {{ seeds: '🌱 Семена', equipment: '⚙️ Техника', team: '👥 Команда', special: '⭐ Особое' }[cat]}
              </button>
            ))}
          </div>

          {/* Cards Grid */}
          <div className="cards-grid">
            {UPGRADE_CARDS.filter(c => c.category === upgradeCategory).map(card => {
              const level = game.upgrades[card.id] || 0;
              const cost = getUpgradeCost(card);
              const canAfford = game.balance >= cost;
              const maxed = level >= card.maxLevel;
              const isComboCard = todayCombo.includes(card.id);

              return (
                <div
                  key={card.id}
                  className={`upgrade-card upgrade-pressable ${maxed ? 'maxed' : ''} ${!canAfford && !maxed ? 'locked' : ''} ${isComboCard ? 'combo-card' : ''}`}
                  onClick={() => !maxed && canAfford && upgradeCard(card)}
                >
                  <div className="card-top">
                    <span className="card-emoji">{card.emoji}</span>
                    <div className="card-info">
                      <h4>{card.name}</h4>
                      <p className="card-desc">{card.description}</p>
                    </div>
                    {level > 0 && <span className="card-level">Lv.{level}</span>}
                  </div>
                  <div className="card-bottom">
                    <div className="card-pph">
                      <TrendingUp size={12} />
                      +{formatNum(card.profitPerHour * (level + 1))}/ч
                    </div>
                    <div className="card-cost">
                      {maxed ? (
                        <span className="maxed-label">MAX</span>
                      ) : (
                        <>{!canAfford && <Lock size={12} />} 🌱 {formatNum(cost)}</>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== FRIENDS TAB ===== */}
      {tab === 'friends' && (
        <div className="tab-content center-content">
          <div className="friends-section">
            <Users size={64} className="icon-green" />
            <h2>Пригласи друзей!</h2>
            <p className="friends-desc">Получите <strong>25,000 🌱</strong> за каждого друга</p>
            <div className="friends-stats">
              <div className="friend-stat">
                <span className="friend-num">{game.friends}</span>
                <span className="friend-label">Друзей</span>
              </div>
              <div className="friend-stat">
                <span className="friend-num">{formatNum(game.friends * 25000)}</span>
                <span className="friend-label">Заработано</span>
              </div>
            </div>
            <button className="btn-primary large" onClick={() => {
              haptic('medium');
              try {
                WebApp.openTelegramLink(
                  `https://t.me/share/url?url=https://t.me/Microgreenuzbekistan_bot/game&text=🌱 Играй в GreenFarm и зарабатывай!`
                );
              } catch { /* */ }
            }}>
              👥 Пригласить друга
            </button>
            <button className="btn-secondary" onClick={copyReferralLink}>
              {copiedLink ? <><Check size={16} /> Ссылка скопирована!</> : <><Copy size={16} /> Скопировать ссылку</>}
            </button>
          </div>
        </div>
      )}

      {/* ===== EARN TAB ===== */}
      {tab === 'earn' && (
        <div className="tab-content">
          <h2 className="tab-title"><Gift size={20} /> Задания</h2>

          {/* Daily Streak */}
          <div className="streak-card">
            <div className="streak-info">
              <Flame size={20} className="icon-orange" />
              <div>
                <h4>Ежедневный бонус</h4>
                <p>День {game.streak + 1} • +{formatNum(2000 * (game.streak + 1))} 🌱</p>
              </div>
            </div>
            <div className="streak-dots">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <div key={d} className={`streak-dot ${d <= game.streak ? 'done' : d === game.streak + 1 ? 'current' : ''}`}>
                  {d <= game.streak ? '✓' : d}
                </div>
              ))}
            </div>
            <button
              className={`btn-primary ${game.streakClaimed ? 'disabled' : ''}`}
              onClick={claimStreak}
              disabled={game.streakClaimed}
            >
              {game.streakClaimed ? '✅ Получено сегодня' : `🔥 Забрать ${formatNum(2000 * (game.streak + 1))} 🌱`}
            </button>
          </div>

          {/* Daily Tasks */}
          <div className="section-divider">Ежедневные задания</div>
          <div className="tasks-list">
            {DAILY_TASKS.map(task => {
              const done = task.check(game);
              const claimed = game.dailyTasksClaimed[task.id] || false;
              return (
                <div
                  key={task.id}
                  className={`task-item ${claimed ? 'completed' : ''}`}
                  onClick={() => done && !claimed && claimDailyTask(task.id, task.reward)}
                >
                  <span className="task-emoji">{task.emoji}</span>
                  <div className="task-info">
                    <h4>{task.title}</h4>
                    <p>+{formatNum(task.reward)} 🌱</p>
                  </div>
                  {claimed ? (
                    <span className="task-done">✅</span>
                  ) : done ? (
                    <button className="btn-claim">Забрать</button>
                  ) : (
                    <ChevronRight size={20} className="task-arrow" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Social Tasks */}
          <div className="section-divider">Социальные задания</div>
          <div className="tasks-list">
            {SOCIAL_TASKS.map(t => {
              const claimed = game.socialTasksClaimed[t.id] || false;
              return (
                <div
                  key={t.id}
                  className={`task-item ${claimed ? 'completed' : ''}`}
                  onClick={() => !claimed && claimSocialTask(t.id, t.reward, t.link)}
                >
                  <span className="task-emoji">{t.emoji}</span>
                  <div className="task-info">
                    <h4>{t.title}</h4>
                    <p>+{formatNum(t.reward)} 🌱</p>
                  </div>
                  {claimed ? (
                    <span className="task-done">✅</span>
                  ) : (
                    <button className="btn-claim">Выполнить</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== BONUS TAB ===== */}
      {tab === 'bonus' && (
        <div className="tab-content center-content">
          <div className="airdrop-section">
            <div
              className="airdrop-icon airdrop-bounce"
            >
              🎁
            </div>
            <h2>Бонусы и награды</h2>
            <p className="airdrop-desc">
              Копите 🌱 GreenCoins — чем больше у вас <strong>прибыли в час</strong>,
              тем больше бонусов можно конвертировать в <strong>реальные скидки</strong> на продукцию!
            </p>
            <div className="airdrop-stats">
              <div className="airdrop-stat">
                <Award size={20} className="icon-green" />
                <span className="airdrop-label">Прибыль/час</span>
                <span className="airdrop-value">{formatNum(game.profitPerHour)}/ч</span>
              </div>
              <div className="airdrop-stat">
                <Trophy size={20} className="icon-yellow" />
                <span className="airdrop-label">Всего заработано</span>
                <span className="airdrop-value">{formatNum(game.totalEarned)}</span>
              </div>
              <div className="airdrop-stat">
                <Star size={20} className="icon-purple" />
                <span className="airdrop-label">Уровень</span>
                <span className="airdrop-value">{currentLevel.name}</span>
              </div>
            </div>
            <div className="conversion-info">
              <h4>💰 Конвертация в скидки</h4>
              <div className="conversion-rates">
                <div className="rate-row"><span>1,000 🌱</span><span>= 1,000 сум скидка</span></div>
                <div className="rate-row"><span>10,000 🌱</span><span>= 15,000 сум скидка</span></div>
                <div className="rate-row"><span>100,000 🌱</span><span>= 200,000 сум скидка</span></div>
              </div>
            </div>
            <div className="airdrop-tips">
              <h4>Как заработать больше?</h4>
              <p>🌱 Улучшайте карточки для роста PPH</p>
              <p>👥 Приглашайте друзей (+25K за друга)</p>
              <p>📅 Заходите каждый день для стрика</p>
              <p>🎯 Выполняйте ежедневные задания</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM TABS ===== */}
      <nav className="bottom-nav">
        {[
          { key: 'farm' as Tab, icon: <Sprout size={20} />, label: 'Ферма' },
          { key: 'upgrade' as Tab, icon: <TrendingUp size={20} />, label: 'Прокачка' },
          { key: 'friends' as Tab, icon: <Users size={20} />, label: 'Друзья' },
          { key: 'earn' as Tab, icon: <Gift size={20} />, label: 'Задания' },
          { key: 'bonus' as Tab, icon: <Star size={20} />, label: 'Бонусы' },
        ].map(t => (
          <button
            key={t.key}
            className={`nav-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); haptic('light'); }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
