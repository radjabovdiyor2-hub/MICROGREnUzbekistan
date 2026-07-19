import { useState, useEffect, useCallback, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import type { GameState, UpgradeCard } from '../types/game';
import { INITIAL_STATE, LEVELS, UPGRADE_CARDS, getDailyCombo, getToday } from '../constants/gameData';

export function useGameEngine() {
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
  const [showOffline, setShowOffline] = useState(false);
  const [offlineEarnings, setOfflineEarnings] = useState(0);
  const [showToast, setShowToast] = useState('');
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

  // Haptic
  const haptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    try { WebApp.HapticFeedback.impactOccurred(type); } catch { /* */ }
  };

  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    haptic('medium');
  }, []);

  // Toast auto-hide
  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(''), 2500);
    return () => clearTimeout(t);
  }, [showToast]);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const getUpgradeCost = useCallback((card: UpgradeCard, currentLevel: number) => {
    return Math.floor(card.baseCost * Math.pow(1.5, currentLevel));
  }, []);

  const upgradeCard = (card: UpgradeCard) => {
    const level = game.upgrades[card.id] || 0;
    if (level >= card.maxLevel) return;
    const cost = getUpgradeCost(card, level);
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

  const claimStreak = () => {
    const today = getToday();
    if (game.streakClaimed) return;
    const reward = 2000 * (game.streak + 1);

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
    toast(`🔥 День ${newStreak}! +${(reward).toLocaleString()} 🌱`);
  };

  const claimDailyTask = (taskId: string, reward: number) => {
    if (game.dailyTasksClaimed[taskId]) return;
    setGame(g => ({
      ...g,
      balance: g.balance + reward,
      totalEarned: g.totalEarned + reward,
      dailyTasksClaimed: { ...g.dailyTasksClaimed, [taskId]: true },
      level: calcLevel(g.totalEarned + reward),
    }));
    toast(`✅ Задание выполнено! +${(reward).toLocaleString()} 🌱`);
  };

  const claimSocialTask = (taskId: string, reward: number, link: string) => {
    if (game.socialTasksClaimed[taskId]) return;
    try { window.open(link, '_blank'); } catch { /* */ }
    setTimeout(() => {
      setGame(g => ({
        ...g,
        balance: g.balance + reward,
        totalEarned: g.totalEarned + reward,
        socialTasksClaimed: { ...g.socialTasksClaimed, [taskId]: true },
        level: calcLevel(g.totalEarned + reward),
      }));
      toast(`✅ +${(reward).toLocaleString()} 🌱`);
    }, 1000);
  };

  const currentLevel = LEVELS[game.level] || LEVELS[0];
  const nextLevel = LEVELS[game.level + 1];
  const progress = nextLevel ? Math.min(100, (game.totalEarned / nextLevel.min) * 100) : 100;
  const todayCombo = getDailyCombo();

  return {
    game,
    setGame,
    clicks,
    showOffline,
    setShowOffline,
    offlineEarnings,
    showToast,
    toast,
    handleTap,
    upgradeCard,
    getUpgradeCost,
    claimStreak,
    claimDailyTask,
    claimSocialTask,
    currentLevel,
    nextLevel,
    progress,
    todayCombo,
    haptic,
  };
}
