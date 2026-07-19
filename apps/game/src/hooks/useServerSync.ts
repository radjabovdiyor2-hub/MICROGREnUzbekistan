import { useEffect, useRef, useCallback } from 'react';
import type { GameState } from '../types/game';
import { API_URL, getTelegramId, getTelegramName } from '../utils/telegram';

export function useServerSync(game: GameState, setGame: React.Dispatch<React.SetStateAction<GameState>>) {
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
  }, [setGame]);

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
}
