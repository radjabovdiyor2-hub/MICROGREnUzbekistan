'use client';

import { useState, useSyncExternalStore } from 'react';
import { ChevronDown, Navigation } from 'lucide-react';

import {
  NAV_APPS,
  NAV_APP_KEY,
  DEFAULT_NAV_APP,
  navApp,
} from '@/lib/customers/navigation';

// ══════════════════════════════════════════════════════════════════════
// «Поехали» — кнопка, которая строит маршрут в мобильном навигаторе.
//
// Раньше на её месте была ссылка на страницу места в вебе: открывался
// браузер, показывал точку, и адрес человек вбивал в навигатор руками.
//
// Выбор приложения спрашивается один раз и запоминается: узнать, что у
// человека установлено, из браузера нельзя, а гадать за него значит
// регулярно открывать не то. Дальше это одно нажатие.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  latitude: number;
  longitude: number;
  lang: 'ru' | 'uz';
}

const label = {
  go: { ru: 'Поехали', uz: 'Yoʻlga' },
  pick: { ru: 'Чем вести', uz: 'Qaysi ilova' },
};

/**
 * Выбранный навигатор читаем через useSyncExternalStore, а не эффектом.
 *
 * localStorage на сервере нет, поэтому наивное `useState(localStorage…)`
 * развалило бы гидратацию, а чтение в эффекте с последующим setState даёт
 * лишний каскад рендеров. Здесь же серверный снимок — значение по
 * умолчанию, клиентский — сохранённый выбор, и React сам решает, когда
 * перерисовать. Побочно выбор синхронизируется между вкладками.
 */
const NAV_EVENT = 'mg-nav-app-changed';

function subscribeToChoice(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

/** Сколько ждать приложение, прежде чем уйти на запасную https-ссылку. */
const SCHEME_TIMEOUT_MS = 1200;

/**
 * Открывает схему приложения и уходит на запасную ссылку, если оно не
 * откликнулось.
 *
 * Проверить установку приложения нельзя, но можно заметить, что страница
 * НЕ ушла в фон: если через секунду мы всё ещё видимы — приложения нет.
 * `document.hidden` здесь надёжнее таймера в одиночку: он не сработает,
 * когда приложение открылось медленно.
 */
function openWithFallback(scheme: string, fallback: string): void {
  let settled = false;
  const onHide = () => {
    if (document.hidden) settled = true;
  };
  document.addEventListener('visibilitychange', onHide);

  window.location.href = scheme;

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (!settled && !document.hidden) window.open(fallback, '_blank', 'noopener');
  }, SCHEME_TIMEOUT_MS);
}

export function NavigateButton({ latitude, longitude, lang }: Props) {
  const [picking, setPicking] = useState(false);
  const appId = useSyncExternalStore(
    subscribeToChoice,
    () => navApp(window.localStorage.getItem(NAV_APP_KEY)).id,
    () => DEFAULT_NAV_APP,
  );

  const choose = (id: string) => {
    window.localStorage.setItem(NAV_APP_KEY, id);
    window.dispatchEvent(new Event(NAV_EVENT));
    setPicking(false);
    go(id);
  };

  const go = (id: string) => {
    const app = navApp(id);
    const link = app.url(latitude, longitude);
    if (app.fallbackUrl) openWithFallback(link, app.fallbackUrl(latitude, longitude));
    else window.open(link, '_blank', 'noopener');
  };

  const current = navApp(appId);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => go(appId)}
          // Крупная цель: по ней жмут на ходу, одной рукой, в машине.
          style={{ flex: 1, minHeight: 44, fontWeight: 'var(--font-semibold)' }}
        >
          <Navigation size={16} /> {label.go[lang]} · {current[lang]}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPicking((v) => !v)}
          aria-label={label.pick[lang]}
          aria-expanded={picking}
          style={{ minHeight: 44, minWidth: 44 }}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {picking && (
        <div style={{ display: 'grid', gap: 4 }}>
          {NAV_APPS.map((app) => (
            <button
              key={app.id}
              type="button"
              className={app.id === appId ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-ghost'}
              onClick={() => choose(app.id)}
              style={{ justifyContent: 'flex-start', minHeight: 40 }}
            >
              {app[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
