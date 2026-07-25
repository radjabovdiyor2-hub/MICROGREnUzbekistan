'use client';

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Wrap children in the `.card-body` padding box. Set false for edge-to-edge
   *  content (e.g. a media image flush to the card edges). */
  padded?: boolean;
}

/**
 * Card — tier-2 surface primitive. Wraps the design-system `.card` (background,
 * radius, border, elevation, hover lift on hover-capable devices).
 */
export function Card({ padded = true, className, children, ...rest }: CardProps) {
  const cls = ['card', className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {padded ? <div className="card-body">{children}</div> : children}
    </div>
  );
}
