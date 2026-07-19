import { TrendingUp, Zap } from 'lucide-react';
import type { GameState } from '../../types/game';

interface FarmTabProps {
  game: GameState;
  currentLevel: { name: string; icon: string; min: number };
  progress: number;
  clicks: { id: number; x: number; y: number; val: number }[];
  handleTap: (e: React.MouseEvent | React.TouchEvent) => void;
}

export function FarmTab({ game, currentLevel, progress, clicks, handleTap }: FarmTabProps) {
  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  return (
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
  );
}
