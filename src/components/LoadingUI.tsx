'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface LoadingUIProps {
  /** When false, nothing renders. When true, the UI appears only after delayMs. */
  active?: boolean;
  /** Wait this long before showing the spinner — skips the flash on fast loads. */
  delayMs?: number;
  /** Primary status line shown under the spinner. */
  message?: string;
  /** Secondary reassurance line — helps readers know the wait is normal. */
  hint?: string;
  /** Visual context: dashboard terminal, flood desk, map canvas, or boot splash. */
  variant?: 'dashboard' | 'flood' | 'map' | 'boot' | 'inline';
  className?: string;
}

const DEFAULT_HINTS: Record<NonNullable<LoadingUIProps['variant']>, string> = {
  dashboard: 'Pulling live hazard feeds — this usually takes a few seconds.',
  flood: 'Fetching the latest figures — hang on a moment.',
  map: 'Loading map layers and live telemetry…',
  boot: 'Starting hazard sweep and live feeds…',
  inline: 'Loading…',
};

/** Default delay before showing the spinner (avoids flash on cache hits). */
export const LOADING_UI_DELAY_MS = 450;

export default function LoadingUI({
  active = true,
  delayMs = LOADING_UI_DELAY_MS,
  message = 'Loading…',
  hint,
  variant = 'dashboard',
  className,
}: LoadingUIProps) {
  const [visible, setVisible] = useState(delayMs === 0);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (delayMs === 0) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  if (!active) return null;

  if (!visible) {
    return (
      <div
        className={cn('atlas-loading', 'atlas-loading--pending', `atlas-loading--${variant}`, className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  const resolvedHint = hint ?? (variant === 'inline' ? undefined : DEFAULT_HINTS[variant]);

  const showSpinner = variant !== 'inline';

  return (
    <div
      className={cn('atlas-loading', `atlas-loading--${variant}`, className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {showSpinner && (
        <div className="atlas-loading-spinner" aria-hidden="true">
          <span className="atlas-loading-ring" />
          <span className="atlas-loading-core" />
        </div>
      )}
      <p className="atlas-loading-message">{message}</p>
      {resolvedHint && <p className="atlas-loading-hint">{resolvedHint}</p>}
      <span className="sr-only">{message}</span>
    </div>
  );
}
