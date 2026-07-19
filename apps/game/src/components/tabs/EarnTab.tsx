import { Gift, Flame, ChevronRight } from 'lucide-react';
import type { GameState } from '../../types/game';
import { DAILY_TASKS, SOCIAL_TASKS } from '../../constants/gameData';

interface EarnTabProps {
  game: GameState;
  claimStreak: () => void;
  claimDailyTask: (taskId: string, reward: number) => void;
  claimSocialTask: (taskId: string, reward: number, link: string) => void;
}

export function EarnTab({ game, claimStreak, claimDailyTask, claimSocialTask }: EarnTabProps) {
  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  return (
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
  );
}
