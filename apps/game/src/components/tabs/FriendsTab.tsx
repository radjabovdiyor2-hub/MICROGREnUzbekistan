import { useState } from 'react';
import { Users, Check, Copy } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import type { GameState } from '../../types/game';

interface FriendsTabProps {
  game: GameState;
  haptic: (type?: 'light' | 'medium' | 'heavy') => void;
}

export function FriendsTab({ game, haptic }: FriendsTabProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText('https://t.me/Microgreenuzbekistan_bot/game');
      setCopiedLink(true);
      haptic('light');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* */ }
  };

  return (
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
  );
}
