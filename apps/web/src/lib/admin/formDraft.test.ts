import { describe, expect, it, beforeEach } from 'vitest';

import { MAX_AGE_MS, draftKey, forgetDraft, readDraft, writeDraft } from './formDraft';

// ══════════════════════════════════════════════════════════════════════
// Черновик формы: закрыл — не потерял.
//
// Проверяются настоящие функции хранилища, а не пересказ их логики: хук
// над ними — тонкая обёртка на эффектах React, а вся цена ошибки здесь.
//
// Каждая проверка соответствует поломке, которая дороже потерянного ввода:
//   · черновик правки товара А, подставленный в форму товара Б, — это уже
//     не потеря ввода, а порча чужих данных;
//   · вчерашний черновик, который выглядит сегодняшним;
//   · испорченная запись, роняющая форму целиком.
// ══════════════════════════════════════════════════════════════════════

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

/** Хранилище, которое отказывает на запись — переполнено или запрещено. */
function refusingStorage(): Storage {
  return {
    ...memoryStorage(),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  } as Storage;
}

interface Form {
  name: string;
  price: string;
}

describe('черновик формы', () => {
  let store: Storage;

  beforeEach(() => {
    store = memoryStorage();
  });

  it('записанное возвращается как есть', () => {
    const key = draftKey('product', null);
    writeDraft<Form>(store, key, { name: 'Руккола', price: '15000' });

    expect(readDraft<Form>(store, key)).toEqual({ name: 'Руккола', price: '15000' });
  });

  it('черновик правки одной записи не подставляется в другую', () => {
    writeDraft<Form>(store, draftKey('product', 'cuid_a'), { name: 'товар А', price: '1' });

    expect(readDraft(store, draftKey('product', 'cuid_b'))).toBeNull();
    expect(readDraft(store, draftKey('product', null))).toBeNull();
    expect(readDraft<Form>(store, draftKey('product', 'cuid_a'))).toEqual({
      name: 'товар А',
      price: '1',
    });
  });

  it('черновики разных форм не смешиваются', () => {
    writeDraft(store, draftKey('product', null), { name: 'товар' });
    writeDraft(store, draftKey('products', null), { name: 'товар' });

    expect(readDraft<{ name: string }>(store, draftKey('product', null))?.name).toBe('товар');
    expect(readDraft<{ name: string }>(store, draftKey('products', null))?.name).toBe('товар');
  });

  it('запись старше суток не возвращается и стирается', () => {
    const key = draftKey('product', null);
    const yesterday = Date.now() - MAX_AGE_MS - 1000;
    writeDraft<Form>(store, key, { name: 'вчерашнее', price: '1' }, yesterday);

    expect(readDraft(store, key)).toBeNull();
    // Не просто «не отдали»: истёкшее не должно лежать вечно.
    expect(store.getItem(key)).toBeNull();
  });

  it('запись почти суточной давности ещё жива', () => {
    const key = draftKey('product', null);
    writeDraft<Form>(store, key, { name: 'вечернее', price: '1' }, Date.now() - MAX_AGE_MS + 60_000);

    expect(readDraft<Form>(store, key)?.name).toBe('вечернее');
  });

  it('испорченная запись не роняет форму', () => {
    const key = draftKey('product', null);
    store.setItem(key, '{это не json');

    expect(readDraft(store, key)).toBeNull();
  });

  it('запись без отметки времени считается отсутствующей', () => {
    const key = draftKey('product', null);
    store.setItem(key, JSON.stringify({ value: { name: 'без даты' } }));

    expect(readDraft(store, key)).toBeNull();
  });

  it('переполненное хранилище не роняет форму', () => {
    const refusing = refusingStorage();

    expect(() => writeDraft(refusing, draftKey('product', null), { name: 'x' })).not.toThrow();
  });

  it('забытый черновик не возвращается', () => {
    const key = draftKey('product', null);
    writeDraft<Form>(store, key, { name: 'Руккола', price: '15000' });
    forgetDraft(store, key);

    expect(readDraft(store, key)).toBeNull();
  });
});
