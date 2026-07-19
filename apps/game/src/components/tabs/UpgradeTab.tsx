import { useState } from 'react';
import { Flame, TrendingUp, Lock } from 'lucide-react';
import type { GameState, UpgradeCard, UpgradeCategory } from '../../types/game';
import { UPGRADE_CARDS } from '../../constants/gameData';

interface UpgradeTabProps {
  game: GameState;
  todayCombo: string[];
  upgradeCard: (card: UpgradeCard) => void;
  getUpgradeCost: (card: UpgradeCard, currentLevel: number) => number;
}

export function UpgradeTab({ game, todayCombo, upgradeCard, getUpgradeCost }: UpgradeTabProps) {
  const [upgradeCategory, setUpgradeCategory] = useState<UpgradeCategory>('seeds');

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  return (
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
        {(['seeds', 'equipment', 'team', 'special', 'companions'] as const).map(cat => (
          <button
            key={cat}
            className={`cat-tab ${upgradeCategory === cat ? 'active' : ''}`}
            onClick={() => setUpgradeCategory(cat)}
          >
            {{ seeds: '🌱 Семена', equipment: '⚙️ Техника', team: '👥 Команда', special: '⭐ Особое', companions: '🦊 Друзья' }[cat]}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="cards-grid">
        {UPGRADE_CARDS.filter(c => c.category === upgradeCategory).map(card => {
          const level = game.upgrades[card.id] || 0;
          const cost = getUpgradeCost(card, level);
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
  );
}
