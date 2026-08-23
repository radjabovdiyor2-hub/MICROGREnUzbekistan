'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import { Toast, type ToastVariant } from '@/components/ui/Toast';

import { useAdminBack } from './useAdminBack';

// ══════════════════════════════════════════════════════════════════════
// Как админка разговаривает с человеком: тост и подтверждение.
//
// БЫЛО
//
// 37 вызовов `alert()` и 20 `confirm()`. Это нативные окна браузера: они
// блокируют поток, не оформляются, не переводятся и — главное — в Telegram
// Mini App выглядят системным листом, который выезжает поверх приложения и
// сбивает его хром. Агроном в теплице подтверждал списание партии окном,
// которое выглядит как ошибка операционной системы.
//
// Хуже всего было в самых частых местах: семь `alert()` в сборе урожая
// (`growingActions.ts`) и восемь в кассе — то есть в двух потоках, которые
// повторяются десятки раз в день, с телефона, одной рукой.
//
// СТАЛО
//
// `toast()` — сообщение, которое не требует ответа: показалось, само ушло,
// работу не прерывает. `confirm()` — обещание, которое разрешается ответом
// человека; поверх готового `ui/Modal`, а тот даёт фокус-ловушку, Escape и
// блокировку прокрутки бесплатно, потому что построен на `<dialog>`.
//
// ПОЧЕМУ ОДИН ПРОВАЙДЕР НА ДВА
//
// Оба нужны там же, где раньше стояли нативные окна, и часто подряд:
// «удалить?» → «удалено». Разведя их по двум контекстам, пришлось бы
// таскать оба хука в каждый экран.
// ══════════════════════════════════════════════════════════════════════

/** Сколько живёт сообщение. Ошибку держим дольше: её читают. */
const LIFETIME_MS: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  warning: 6000,
  error: 8000,
};

interface ToastItem {
  id: number;
  variant: ToastVariant;
  text: ReactNode;
}

export interface ConfirmOptions {
  /** Заголовок: что именно произойдёт. */
  title: string;
  /** Последствие — то, чего не видно из заголовка. */
  detail?: ReactNode;
  /** Подпись согласия. По умолчанию «Подтвердить». */
  confirmText?: string;
  /** Действие необратимо — кнопка красная. */
  danger?: boolean;
}

interface FeedbackApi {
  toast: (text: ReactNode, variant?: ToastVariant) => void;
  success: (text: ReactNode) => void;
  error: (text: ReactNode) => void;
  /** `true` — человек согласился. Промис, а не блокировка потока. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

/**
 * Доступ к тосту и подтверждению.
 *
 * Вне провайдера падает намеренно: тихая заглушка означала бы, что
 * подтверждение удаления «согласилось» само — незаметно и необратимо.
 */
export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error('useFeedback вызван вне <AdminFeedbackProvider>');
  return api;
}

export function AdminFeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [ask, setAsk] = useState<ConfirmOptions | null>(null);
  const nextId = useRef(1);
  /** Чем ответить ожидающему `confirm`. Живёт вне состояния: его не рисуют. */
  const answer = useRef<((ok: boolean) => void) | null>(null);

  const drop = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (text: ReactNode, variant: ToastVariant = 'info') => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, variant, text }]);
      window.setTimeout(() => drop(id), LIFETIME_MS[variant]);
    },
    [drop],
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    setAsk(options);
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setAsk(null);
    answer.current?.(ok);
    answer.current = null;
  }, []);

  // «Назад» на открытом вопросе означает «нет», а не «выйти из приложения».
  // Escape и клик по фону `ui/Modal` уже дают то же самое — аппаратная
  // кнопка Telegram обязана вести себя так же, иначе на телефоне
  // подтверждение становится ловушкой.
  const dismiss = useCallback(() => close(false), [close]);
  useAdminBack(dismiss, ask !== null);

  const api = useMemo<FeedbackApi>(
    () => ({
      toast,
      success: (text) => toast(text, 'success'),
      error: (text) => toast(text, 'error'),
      confirm,
    }),
    [toast, confirm],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {/* Стопка: сообщения не наезжают друг на друга, новое снизу.
          `inline` снимает с самого тоста фиксацию — позицию держит эта
          обёртка, иначе все легли бы в одну точку экрана. */}
      <div
        style={{
          position: 'fixed',
          top: 'calc(var(--header-height) + var(--space-4))',
          right: 'var(--space-4)',
          zIndex: 'var(--z-toast)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          maxWidth: 'min(380px, calc(100vw - var(--space-6)))',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((item) => (
          <div key={item.id} style={{ pointerEvents: 'auto' }}>
            <Toast inline variant={item.variant} onClose={() => drop(item.id)}>
              {item.text}
            </Toast>
          </div>
        ))}
      </div>

      <Modal open={ask !== null} onClose={() => close(false)}>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>
            {ask?.title}
          </h3>
          {ask?.detail && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
              {ask.detail}
            </p>
          )}
          {/* Отмена слева, согласие справа — один порядок во всей админке.
              Раньше он был разным от экрана к экрану, и мышечная память
              работала против человека. */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => close(false)} style={{ minHeight: 44 }}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => close(true)}
              style={{ minHeight: 44, ...(ask?.danger ? { background: 'var(--error)', borderColor: 'var(--error)' } : {}) }}
            >
              {ask?.confirmText ?? 'Подтвердить'}
            </button>
          </div>
        </div>
      </Modal>
    </FeedbackContext.Provider>
  );
}
