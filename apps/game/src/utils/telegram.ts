import WebApp from '@twa-dev/sdk';

export const API_URL = 'https://microgreenuzbekistan.com/api';

export function getTelegramId(): number | null {
  try {
    const user = WebApp.initDataUnsafe?.user;
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export function getTelegramName(): string {
  try {
    const user = WebApp.initDataUnsafe?.user;
    return user?.first_name || user?.username || 'Player';
  } catch {
    return 'Player';
  }
}
