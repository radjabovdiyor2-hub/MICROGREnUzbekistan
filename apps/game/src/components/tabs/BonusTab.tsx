import { Award, Trophy, Star } from 'lucide-react';
import type { GameState } from '../../types/game';

interface BonusTabProps {
  game: GameState;
  currentLevel: { name: string; icon: string; min: number };
}

export function BonusTab({ game, currentLevel }: BonusTabProps) {
  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  return (
    <div className="tab-content center-content">
      <div className="airdrop-section">
        <div className="airdrop-icon airdrop-bounce">
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
  );
}
