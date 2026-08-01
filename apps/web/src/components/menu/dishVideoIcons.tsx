// Иконки плеера блюда: звук и воспроизведение. Нарисованы вручную,
// потому что должны совпадать с системными в Telegram Mini App.

export function SpeakerSlash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="23" y1="9" x2="17" y2="15" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="9" x2="23" y2="15" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function SpeakerWave() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15.54 8.46a5 5 0 010 7.07" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M19.07 4.93a10 10 0 010 14.14" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="rgb(var(--overlay-light-rgb))">
      <path d="M8 5v14l11-7z"/>
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="rgb(var(--overlay-light-rgb))">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
}
