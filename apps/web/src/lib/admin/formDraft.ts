'use client';

import { useEffect, useRef } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Черновик формы: закрыл — не потерял.
//
// ЧЕГО НЕ БЫЛО. Форма товара это полтора десятка полей, форма посадки —
// столько же. Закрыл её случайно, нажал «назад» на телефоне, обновил
// вкладку — введённое исчезало целиком, и человек набирал всё заново. При
// этом очереди в localStorage в проекте уже есть и работают
// (`lib/pos/saleQueue.ts`, `lib/customers/visitQueue.ts`): не хватало не
// механизма, а его применения к формам.
//
// ЧЕРНОВИК ВОССТАНАВЛИВАЕТСЯ САМ, НО ЗАМЕТНО. Молча подставить старые
// значения нельзя: человек открывает «добавить товар», видит заполненные
// поля и не понимает, откуда они. Поэтому восстановление идёт через
// `onRestore` — вызывающий и подставляет значения, и поднимает свой флаг,
// по которому экран говорит, что это черновик.
//
// КЛЮЧ ВКЛЮЧАЕТ ЗАПИСЬ, которую правят. Иначе черновик правки товара А
// подставился бы в форму товара Б — а это уже не потеря ввода, а порча
// чужих данных.
//
// ⚠️ НЕ ПОДКЛЮЧАТЬ К ФОРМАМ С СЕКРЕТАМИ. Черновик лежит в localStorage
// открытым текстом сутки и переживает закрытие вкладки. Форма сотрудника
// содержит PIN — это учётные данные, и черновика у неё нет намеренно.
// Понадобится — сначала вырезать поле, а не хранить «пока так».
//
// Работа с хранилищем вынесена в чистые функции ниже намеренно: их можно
// проверить по-настоящему, а не пересказом их же логики в тесте.
// ══════════════════════════════════════════════════════════════════════

/** Сколько живёт черновик. Вчерашний чаще путает, чем помогает. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Пауза перед записью: печатают быстрее, чем стоит трогать хранилище. */
const SAVE_DELAY_MS = 400;

const PREFIX = 'admin:draft:';

interface Stored<T> {
  at: number;
  value: T;
}

/** Ключ хранилища. `null` — новая запись, иначе правка конкретной. */
export function draftKey(name: string, recordId: string | null): string {
  return `${PREFIX}${name}:${recordId ?? 'new'}`;
}

/**
 * Прочитать черновик. `null` — его нет, он истёк или запись испорчена.
 *
 * Истёкшая запись стирается прямо здесь: иначе она лежала бы вечно и
 * каждый раз проверялась заново.
 */
export function readDraft<T>(store: Storage, key: string, now = Date.now()): T | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (now - parsed.at > MAX_AGE_MS) {
      store.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    // Испорченная запись — не повод ронять форму: её просто нет.
    return null;
  }
}

/** Записать черновик. Переполненное или запрещённое хранилище — не ошибка. */
export function writeDraft<T>(
  store: Storage,
  key: string,
  value: T,
  now = Date.now(),
): void {
  try {
    store.setItem(key, JSON.stringify({ at: now, value } satisfies Stored<T>));
  } catch {
    // Форма продолжает работать как раньше, без черновика.
  }
}

/** Забыть черновик. */
export function forgetDraft(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Нечего забывать — уже хорошо.
  }
}

interface Options<T> {
  /** Имя формы: `product`, `growing`, `employee`. */
  name: string;
  /** Что правим. `null` — новая запись. */
  recordId?: string | null;
  /** Открыта ли форма. Закрытая ничего не пишет и не читает. */
  open: boolean;
  /** Текущее значение формы. */
  value: T;
  /**
   * Черновик нашёлся. Вызывающий обязан и подставить его в форму, и
   * показать, что это черновик.
   *
   * Флаг «восстановлено» живёт у вызывающего, а не здесь: у хука тогда
   * не остаётся собственного состояния, и он не дёргает перерисовку из
   * эффекта. Заодно исчезает вопрос, кто чей флаг сбрасывает.
   */
  onRestore: (value: T) => void;
  /** Значение считается пустым — черновик такого не нужен. */
  isEmpty: (value: T) => boolean;
}

/**
 * Хранить незаконченный ввод и вернуть его при следующем открытии.
 *
 * Возвращает `forget` — забыть черновик. Звать его надо в двух случаях:
 * после успешной отправки и по кнопке «начать заново». Само закрытие
 * формы черновик НЕ стирает — в этом весь смысл: закрыли случайно,
 * вернулись, продолжили.
 */
export function useFormDraft<T>({
  name,
  recordId = null,
  open,
  value,
  onRestore,
  isEmpty,
}: Options<T>): () => void {
  const key = draftKey(name, recordId);

  // Свежие ссылки на обработчики. Иначе восстановление зависело бы от них
  // и перезапускалось на каждом нажатии клавиши — черновик подставлялся бы
  // поверх того, что человек только что набрал.
  //
  // Присваивание в эффекте, а не в теле: во время отрисовки ссылки трогать
  // нельзя, и это правило не формальность — при повторной отрисовке
  // (React их делает) тело выполнится дважды, а эффект один раз.
  const onRestoreRef = useRef(onRestore);
  const isEmptyRef = useRef(isEmpty);

  useEffect(() => {
    onRestoreRef.current = onRestore;
    isEmptyRef.current = isEmpty;
  });

  /**
   * Значение, с которым форму открыли.
   *
   * ⚠️ Без него правка существующей записи заводила черновик сама собой:
   * форма открывается, заполняется данными с сервера, и через 400 мс они
   * же ложатся в хранилище. В следующий раз человек видит «восстановлен
   * незаконченный черновик», хотя ничего не менял, — а ложное
   * предупреждение хуже отсутствующего: его перестают читать.
   */
  const opening = useRef<string | null>(null);

  // ── Восстановление: один раз на открытие ──────────────────────────
  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      opening.current = null;
      return;
    }
    const saved = readDraft<T>(window.localStorage, key);
    if (saved && !isEmptyRef.current(saved)) {
      opening.current = JSON.stringify(saved);
      onRestoreRef.current(saved);
    }
  }, [open, key]);

  // ── Запись: с паузой, и только когда есть что писать ──────────────
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    if (isEmptyRef.current(value)) return;

    const snapshot = JSON.stringify(value);
    // Первое значение после открытия — это то, что показала форма, а не
    // то, что набрал человек. Запоминаем и не пишем.
    if (opening.current === null) {
      opening.current = snapshot;
      return;
    }
    if (opening.current === snapshot) return;

    const timer = window.setTimeout(() => {
      writeDraft(window.localStorage, key, value);
    }, SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [open, key, value]);

  return () => {
    if (typeof window !== 'undefined') forgetDraft(window.localStorage, key);
  };
}
