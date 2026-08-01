// Оформление статусов остатков. Вынесено из AdminInventory — чистые данные без состояния.

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'Kritik', color: 'var(--error)', bg: 'var(--error-bg)' },
  LOW: { label: 'Kam', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  NORMAL: { label: 'Normal', color: 'var(--success)', bg: 'var(--success-bg)' },
  EXCESS: { label: 'Ortiqcha', color: 'var(--info)', bg: 'var(--info-bg)' },
};
