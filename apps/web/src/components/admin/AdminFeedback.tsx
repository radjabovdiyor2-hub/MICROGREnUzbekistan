'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { deferAction } from '@/lib/admin/deferredAction';
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
//
// ОТМЕНА ДЕЙСТВИЯ (`undoable`)
//
// Подтверждение спрашивает ДО, отмена даёт передумать ПОСЛЕ. Нужны оба:
// диалог ловит промах мышью, но не ловит «нажал правильно и сразу понял,
// что не тот».
//
// Отмена здесь настоящая, а не косметическая: действие не выполняется,
// пока идёт отсчёт. Поэтому и текст «Удаляю…», а не «Удалено» — строка
// пропадёт из списка через несколько секунд, и обещать иное нельзя.
// Косметическая отмена, которая на самом деле удаляет сразу и потом
// «восстанавливает», была бы хуже её отсутствия: восстановить получится
// не всё и не всегда, а полагаться на неё начнут.
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
  /** Отменить отложенное действие. Есть только у `undoable`. */
  undo?: () => void;
  /**
   * Выполнить отложенное немедленно. Крестик на таком тосте означает «мне
   * не нужна отмена», а не «передумал»: намерение человек уже высказал,
   * и закрытие сообщения его не отменяет. Тот же принцип, что при уходе
   * с экрана.
   */
  proceed?: () => void;
}

/** Сколько времени на «передумал». Меньше — не успеть, больше — забыть. */
const UNDO_MS = 6000;

export interface UndoableOptions {
  /** Что происходит. «Удаляю товар», а не «Удалено»: ещё не удалено. */
  text: ReactNode;
  /** Выполнить, если не отменили. */
  run: () => void;
  /** Что сказать, когда отменили. По умолчанию «Отменено». */
  undoneText?: ReactNode;
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
  /**
   * Выполнить действие через несколько секунд, дав возможность передумать.
   *
   * Действие НЕ выполняется, пока идёт отсчёт: отмена настоящая.
   */
  undoable: (options: UndoableOptions) => void;
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
  /**
   * Отложенные действия: id тоста → «выполнить сейчас». Не рисуется.
   *
   * Нужны, чтобы довести их до конца при уходе с экрана: человеку сказано
   * «удаляю», и молча не удалить — значит соврать. Отсчёт даёт передумать,
   * а не отменяет намерение по умолчанию.
   */
  const pending = useRef(new Map<number, () => void>());

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

  /**
   * Отложить действие и показать «Отменить».
   *
   * Взаимоисключение трёх исходов — «выполнено», «отменено», «доведено при
   * уходе» — живёт в `lib/admin/deferredAction`: внутри компонента его
   * нечем проверить, а ошибка там означает удаление после нажатия
   * «Отменить» либо удаление дважды.
   */
  const undoable = useCallback(
    ({ text, run, undoneText }: UndoableOptions) => {
      const id = nextId.current++;

      const task = deferAction(run, {
        delayMs: UNDO_MS,
        onDone: () => {
          pending.current.delete(id);
          drop(id);
        },
        onCancelled: () => {
          pending.current.delete(id);
          drop(id);
          toast(undoneText ?? 'Отменено', 'info');
        },
      });

      pending.current.set(id, task.flush);
      setToasts((list) => [
        ...list,
        { id, variant: 'warning', text, undo: task.cancel, proceed: task.flush },
      ]);
    },
    [drop, toast],
  );

  // Уходим с экрана — доводим отложенное до конца. Иначе «удаляю…»
  // осталось бы обещанием: человек считает строку удалённой, а она на
  // месте, и узнает об этом при следующем открытии списка. Отсчёт даёт
  // передумать, а не отменяет намерение по умолчанию.
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const flush of Array.from(map.values())) flush();
      map.clear();
    };
  }, []);

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
      undoable,
    }),
    [toast, confirm, undoable],
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
            <Toast
              inline
              variant={item.variant}
              onClose={() => (item.proceed ? item.proceed() : drop(item.id))}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {item.text}
                {item.undo && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={item.undo}
                    style={{ minHeight: 32 }}
                  >
                    Отменить
                  </button>
                )}
              </span>
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
