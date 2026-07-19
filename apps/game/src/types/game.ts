export type Tab = 'farm' | 'upgrade' | 'friends' | 'earn' | 'bonus';

export type UpgradeCategory = 'seeds' | 'equipment' | 'team' | 'special' | 'companions';

export interface UpgradeCard {
  id: string;
  name: string;
  emoji: string;
  category: UpgradeCategory;
  description: string;
  baseCost: number;
  level: number;
  maxLevel: number;
  profitPerHour: number;
  requirement?: string;
}

export interface GameState {
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
