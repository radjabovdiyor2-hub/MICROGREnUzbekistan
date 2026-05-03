'use client';

export function LogoIcon({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Microgreen Uzbekistan Logo"
    >
      <defs>
        <linearGradient id="logo-gradient-circle" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="logo-gradient-leaf1" x1="20" y1="10" x2="32" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="logo-gradient-leaf2" x1="16" y1="16" x2="24" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6EE7B7" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
      {/* Circle */}
      <circle
        cx="24" cy="24" r="21"
        stroke="url(#logo-gradient-circle)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="128 4"
      />
      {/* Ground */}
      <ellipse cx="24" cy="35" rx="8" ry="2.5" fill="url(#logo-gradient-circle)" opacity="0.7" />
      {/* Stem */}
      <path
        d="M24 35 L24 22"
        stroke="url(#logo-gradient-circle)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Right leaf (bigger) */}
      <path
        d="M24 22 C24 18 30 12 34 11 C34 15 30 20 24 22Z"
        fill="url(#logo-gradient-leaf1)"
      />
      {/* Right leaf vein */}
      <path
        d="M24.5 21.5 C26 19 29 15 32 13"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Left leaf (smaller) */}
      <path
        d="M24 26 C24 23 19 18 16 17 C16 20 19 24 24 26Z"
        fill="url(#logo-gradient-leaf2)"
      />
      {/* Left leaf vein */}
      <path
        d="M23.5 25 C22 23 20 20.5 17.5 18.5"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
