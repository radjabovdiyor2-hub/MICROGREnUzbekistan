import { useState } from 'react';
import { Sprout, TrendingUp, Users, Gift, Star, Clock } from 'lucide-react';
import './App.css';

import type { Tab } from './types/game';
import { useGameEngine } from './hooks/useGameEngine';
import { useServerSync } from './hooks/useServerSync';

import { FarmTab } from './components/tabs/FarmTab';
import { UpgradeTab } from './components/tabs/UpgradeTab';
import { FriendsTab } from './components/tabs/FriendsTab';
import { EarnTab } from './components/tabs/EarnTab';
import { BonusTab } from './components/tabs/BonusTab';

function App() {
  const [tab, setTab] = useState<Tab>('farm');
  
  // Custom hooks handling logic and sync
  const engine = useGameEngine();
  useServerSync(engine.game, engine.setGame);

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  return (
    <div className="app-container">
      {/* Toast notification */}
      {engine.showToast && (
        <div className="toast toast-enter">
          {engine.showToast}
        </div>
      )}

      {/* Offline Earnings Modal */}
      {engine.showOffline && (
        <div className="modal-overlay modal-enter">
          <div className="modal-card modal-card-enter">
            <Clock size={48} className="modal-icon" />
            <h2>Пока вас не было...</h2>
            <p className="modal-subtitle">Ваша ферма заработала</p>
            <p className="modal-amount">+{formatNum(engine.offlineEarnings)} 🌱</p>
            <button className="btn-primary large" onClick={() => engine.setShowOffline(false)}>Забрать!</button>
          </div>
        </div>
      )}

      {/* TABS CONTENT */}
      {tab === 'farm' && (
        <FarmTab
          game={engine.game}
          currentLevel={engine.currentLevel}
          progress={engine.progress}
          clicks={engine.clicks}
          handleTap={engine.handleTap}
        />
      )}

      {tab === 'upgrade' && (
        <UpgradeTab
          game={engine.game}
          todayCombo={engine.todayCombo}
          upgradeCard={engine.upgradeCard}
          getUpgradeCost={engine.getUpgradeCost}
        />
      )}

      {tab === 'friends' && (
        <FriendsTab game={engine.game} haptic={engine.haptic} />
      )}

      {tab === 'earn' && (
        <EarnTab
          game={engine.game}
          claimStreak={engine.claimStreak}
          claimDailyTask={engine.claimDailyTask}
          claimSocialTask={engine.claimSocialTask}
        />
      )}

      {tab === 'bonus' && (
        <BonusTab
          game={engine.game}
          currentLevel={engine.currentLevel}
        />
      )}

      {/* BOTTOM NAVIGATION */}
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
            onClick={() => { setTab(t.key); engine.haptic('light'); }}
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
