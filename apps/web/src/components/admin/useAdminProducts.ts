'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, Product } from './productTypes';

// ══════════════════════════════════════════════════════════════════════
// Данные экрана «Товары»: список, счётчики, справочник рубрик, мутации.
//
// ЧТО ЗДЕСЬ ЧИНИТСЯ
//
// Экран был единственным крупным списком админки на ручных useState +
// useEffect + fetch, и из этого следовали ТРИ разные жалобы владельца.
//
//   1. «Удалил товар — он не исчез». `deleteProduct` не читал ни `res.ok`,
//      ни тело ответа, а список перезапрашивался с `all=true` — то есть
//      специально просил показать И снятые с продажи. Сервер честно отвечал
//      «снял с продажи, удалить нельзя: по товару есть продажи», и этот
//      ответ выбрасывался. Теперь режим списка отделяет активные от архива,
//      а сообщение сервера видно.
//
//   2. «Медленно». После удаления шёл полный перезапрос со `setLoading(true)`:
//      список подменялся спиннером и сбрасывался на первую страницу, даже
//      если владелец долистал до пятой. Теперь обновление оптимистичное —
//      строка исчезает мгновенно, а при отказе возвращается на место.
//
//   3. «Возврат на вкладку — снова загрузка». Роутер вкладок размонтирует
//      экран целиком, и весь useState умирал вместе с ним. Кэш React Query
//      переживает размонтирование: второй заход рисуется сразу.
//
// Счётчики «всего/активных/в архиве» инвалидируются после КАЖДОЙ мутации:
// раньше они жили с `staleTime` 60 с и не пересчитывались никогда.
// ══════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 50;

/** Что показывает список. Совпадает с `mode` у `GET /api/products`. */
export type ProductMode = 'active' | 'archived';

export interface ProductCounts {
  total: number;
  active: number;
  archived: number;
}

export interface Notice {
  variant: 'success' | 'error' | 'info';
  text: string;
}

interface ProductPage {
  items: Product[];
  total: number;
  totalPages: number;
}

type CachedPages = { pages: ProductPage[]; pageParams: unknown[] };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Текст ошибки от сервера, а не общая «что-то пошло не так». */
function serverError(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' ? body.error : fallback;
}

export function useAdminProducts() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ProductMode>('active');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  // Дебаунс ТОЛЬКО на ввод. Раньше таймер стоял на самом запросе, поэтому
  // первая загрузка экрана тоже ждала 300 мс впустую.
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const listKey = ['admin-products', mode, categoryFilter, searchQuery];

  const list = useInfiniteQuery<ProductPage>({
    queryKey: listKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        mode,
        limit: String(PAGE_SIZE),
        page: String(pageParam),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await fetch(`/api/products?${params}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(serverError(await readJson(res), 'Не удалось загрузить товары'));
      const body = await readJson(res);
      const pagination = (body.pagination ?? {}) as { total?: number; totalPages?: number };
      return {
        items: (body.items ?? []) as Product[],
        total: pagination.total ?? 0,
        totalPages: pagination.totalPages ?? 1,
      };
    },
    getNextPageParam: (last, pages) => (pages.length < last.totalPages ? pages.length + 1 : undefined),
  });

  const counts = useQuery<ProductCounts>({
    queryKey: ['admin-products-counts'],
    queryFn: async () => {
      const res = await fetch('/api/products?count=true', { credentials: 'same-origin' });
      const body = await readJson(res);
      return {
        total: Number(body.total ?? 0),
        active: Number(body.active ?? 0),
        archived: Number(body.archived ?? 0),
      };
    },
  });

  const categories = useQuery<Category[]>({
    queryKey: ['admin-products-categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories', { credentials: 'same-origin' });
      const body = await readJson(res);
      return (body.categories ?? []) as Category[];
    },
  });

  /** Убрать строку из кэша сразу — не дожидаясь ответа сервера. */
  const dropFromList = useCallback(
    (id: string) => {
      const key = ['admin-products', mode, categoryFilter, searchQuery];
      const previous = queryClient.getQueryData<CachedPages>(key);
      queryClient.setQueryData<CachedPages>(key, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((p) => p.id !== id),
                total: Math.max(0, page.total - 1),
              })),
            }
          : old,
      );
      return previous;
    },
    [queryClient, mode, categoryFilter, searchQuery],
  );

  /** Вернуть кэш, каким он был до неудачной мутации. */
  const restore = useCallback(
    (previous: CachedPages | undefined) => {
      if (previous) {
        queryClient.setQueryData(['admin-products', mode, categoryFilter, searchQuery], previous);
      }
    },
    [queryClient, mode, categoryFilter, searchQuery],
  );

  const settle = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    queryClient.invalidateQueries({ queryKey: ['admin-products-counts'] });
  }, [queryClient]);

  const remove = useMutation({
    mutationFn: async ({ id, force }: { id: string; force: boolean }) => {
      const res = await fetch(`/api/products?id=${id}${force ? '&force=true' : ''}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(serverError(body, 'Не удалось удалить товар'));
      return body as { removed?: boolean; message?: string; kept?: number };
    },
    // Строка уходит из списка сразу в обоих режимах: из «Активных» — потому
    // что товар снят с продажи, из «Архива» — потому что удалён насовсем.
    onMutate: ({ id }) => ({ previous: dropFromList(id) }),
    onError: (err: Error, _vars, ctx) => {
      restore(ctx?.previous);
      setNotice({ variant: 'error', text: err.message });
    },
    onSuccess: (body) => {
      if (body.message) setNotice({ variant: body.removed ? 'success' : 'info', text: body.message });
    },
    onSettled: settle,
  });

  const toggleActive = useMutation({
    mutationFn: async (product: Product) => {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: product.id, isActive: !product.isActive }),
      });
      if (!res.ok) throw new Error(serverError(await readJson(res), 'Не удалось изменить статус'));
    },
    // Смена статуса переносит товар между «Активными» и «Архивом», поэтому
    // из текущего списка он уходит — как и при удалении.
    onMutate: (product) => ({ previous: dropFromList(product.id) }),
    onError: (err: Error, _product, ctx) => {
      restore(ctx?.previous);
      setNotice({ variant: 'error', text: err.message });
    },
    onSettled: settle,
  });

  const products = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  return {
    mode, setMode,
    searchInput, setSearchInput,
    categoryFilter, setCategoryFilter,
    notice, setNotice,
    products,
    total,
    loading: list.isPending,
    loadingMore: list.isFetchingNextPage,
    hasMore: Boolean(list.hasNextPage),
    loadMore: () => { void list.fetchNextPage(); },
    listError: list.error instanceof Error ? list.error.message : '',
    counts: counts.data ?? { total: 0, active: 0, archived: 0 },
    categories: categories.data ?? [],
    remove,
    toggleActive,
    refreshAll: settle,
  };
}
