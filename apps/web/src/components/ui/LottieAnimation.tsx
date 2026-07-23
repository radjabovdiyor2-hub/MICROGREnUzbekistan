'use client';

import dynamic from 'next/dynamic';
import type { CSSProperties } from 'react';

const LottiePlayer = dynamic(() => import('lottie-react'), { ssr: false });

interface LottieAnimationProps {
  /** Lottie JSON animation data (imported or fetched) */
  animationData: object;
  /** Play in loop. Default: false */
  loop?: boolean;
  /** Auto-play on mount. Default: true */
  autoplay?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function LottieAnimation({
  animationData,
  loop = false,
  autoplay = true,
  style,
  className,
}: LottieAnimationProps) {
  return (
    <LottiePlayer
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      style={style}
      className={className}
    />
  );
}
