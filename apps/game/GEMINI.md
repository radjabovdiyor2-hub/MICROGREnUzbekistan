# apps/game — Farm Simulator (Telegram Mini App)

## What this is
Tap-to-earn game embedded in Telegram as a Mini App (TWA).

## Tech
- Vite + React + TypeScript
- CSS Modules (App.css)
- @twa-dev/sdk for Telegram integration

## 🚫 CRITICAL CONSTRAINTS (Never do this)
- NEVER split `App.tsx` into multiple files. The architecture explicitly keeps all game logic in one file.
- NEVER add heavy animation libraries (like framer-motion) to keep the bundle size minimal for Telegram. Use native CSS animations.
- NEVER modify an upgrade's `baseCost` without mathematically balancing its `profitPerHour`.
- NEVER use `any` types for the GameState.

## Game Economy & State
- State is persisted to localStorage (`greenfarm_v3`) and synced via `https://microgreenuzbekistan.com/api/game`.
- Upgrade categories: seeds, equipment, team, special, companions.

## Handling Mistakes
- If the game crashes on load, check if the localStorage schema changed. Write migration logic in the `useEffect` that loads the state.
- If UI is broken on mobile, remember that `Telegram.WebApp.expand()` is called. Test with `max-width: 100vw`.
