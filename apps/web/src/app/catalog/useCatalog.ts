'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { PAGE_SIZE, type Product, type Pagination } from './catalogConfig';

export function useCatalog(initialCategory: string) {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || initialCategory);
  const [sort, setSort] = useState('featured');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const fetchProducts = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setError(false);

    try {
      const params = new URLSearchParams();
      if (activeCategory) params.set('category', activeCategory);
      params.set('sort', sort);
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));
      if (search) params.set('search', search);

      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();

      if (append) {
        setProducts(prev => [...prev, ...(data.items || [])]);
      } else {
        setProducts(data.items || []);
      }
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeCategory, sort, search]);

  useEffect(() => {
    fetchProducts(1, false);
  }, [fetchProducts]);

  const lastUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlCat = searchParams.get('category') || initialCategory;
    const key = `${urlSearch} ${urlCat}`;

    if (lastUrlRef.current === null) {
      lastUrlRef.current = key;
      return;
    }
    if (lastUrlRef.current === key) return;
    lastUrlRef.current = key;

    setSearch(urlSearch);
    setActiveCategory(urlCat);
  }, [searchParams, initialCategory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(1, false);
  };

  const loadMore = () => {
    if (pagination && pagination.page < pagination.totalPages) {
      fetchProducts(pagination.page + 1, true);
    }
  };

  const hasMore = pagination ? pagination.page < pagination.totalPages : false;

  return {
    products,
    activeCategory,
    setActiveCategory,
    sort,
    setSort,
    search,
    setSearch,
    loading,
    loadingMore,
    error,
    pagination,
    handleSearch,
    loadMore,
    hasMore,
    fetchProducts,
  };
}
