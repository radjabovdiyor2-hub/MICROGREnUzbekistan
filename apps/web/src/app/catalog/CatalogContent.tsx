'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { ProductCard } from '@/components/shop/ProductCard';
import { useLang } from '@/components/providers/LangProvider';
import { CATEGORIES, LINES, SORT_OPTIONS } from './catalogConfig';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { FloatingGreenery } from '@/components/ui/FloatingGreenery';
import { useCatalog } from './useCatalog';

export function CatalogContent({ initialCategory = '' }: { initialCategory?: string }) {
  const { t } = useLang();
  const {
    products, activeCategory, setActiveCategory, activeLine, setActiveLine, sort, setSort, search, setSearch,
    loading, loadingMore, error, pagination, handleSearch, loadMore, hasMore, fetchProducts,
  } = useCatalog(initialCategory);

  return (
    <div style={{ position: 'relative' }}>
      <FloatingGreenery count={14} style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0,
      }} />
      <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <ScrollReveal variant="left">
        <div style={{ marginBottom: 'var(--space-8)', paddingTop: 'var(--space-4)' }}>
          <h1 className="section-title" style={{ marginBottom: 'var(--space-3)', letterSpacing: '-0.03em' }}>
            {t('Katalog', 'Каталог')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-lg)', maxWidth: '46ch' }}>
            {t('Barcha mahsulotlar bir joyda — tanlang va buyurtma bering!', 'Все товары в одном месте — выбирайте и заказывайте.')}
          </p>
        </div>
      </ScrollReveal>

      <form onSubmit={handleSearch} style={{ marginBottom: 'var(--space-4)' }}>
        <div className="search-bar" style={{ maxWidth: 'none' }}>
          <span className="search-bar__icon"><Search size={18} /></span>
          <input
            className="search-bar__input"
            type="text"
            placeholder={t("Mahsulot qidirish... (masalan: rukkola, urug', substrat)", "Поиск товаров... (например: руккола, семена, субстрат)")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="catalog-search"
          />
          <span className="search-bar__ai-badge">
            <Sparkles size={14} style={{ marginRight: '4px' }} /> AI
          </span>
        </div>
      </form>

      <div className="categories-scroll" style={{ paddingLeft: 0, marginBottom: 'var(--space-4)' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.slug}
            className={`category-pill ${activeCategory === cat.slug ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.slug)}
            id={`filter-${cat.slug || 'all'}`}
          >
            <span className="category-pill__icon">{cat.icon}</span>
            <span className="category-pill__name" translate="no">{t(cat.nameUz, cat.nameRu)}</span>
          </button>
        ))}
      </div>

      {/* Линейки — второй ряд, «для кого». Отдельно от рубрик намеренно:
          рубрика отвечает на «что это» и у товара одна, а линеек несколько —
          один и тот же шпинат служит и детской, и ежедневной кухне.

          ПЕРЕНОС, А НЕ ПРОКРУТКА. Линеек шесть, и на телефоне в строку влезало
          четыре: CHEF и BOLAJON уезжали за край, и владелец их просто не
          видел. Прокрутку заметно не всем, а выбор, которого не видно, не
          существует. У рубрик прокрутка осталась — там иконки и длинные имена.

          `translate="no"` — чтобы браузер не переводил названия линеек.
          Chrome на телефоне превращал KUNLIK в «ЕЖЕДНЕВНО», а OSHXONA в
          «КУХНЯ»: имя бренда переставало быть именем. */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
        aria-label={t('Liniyalar', 'Линейки')}
      >
        {LINES.map((line) => (
          <button
            key={line.slug || 'all-lines'}
            className={`category-pill ${activeLine === line.slug ? 'active' : ''}`}
            onClick={() => setActiveLine(line.slug)}
            id={`line-${line.slug || 'all'}`}
          >
            <span className="category-pill__name" translate={line.slug ? 'no' : undefined}>
              {t(line.nameUz, line.nameRu)}
            </span>
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-4)',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
      }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {pagination 
            ? t(`${pagination.total} ta mahsulotdan ${products.length} tasi`, `Показано ${products.length} из ${pagination.total} товаров`) 
            : t(`${products.length} ta mahsulot topildi`, `Найдено ${products.length} товаров`)}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            outline: 'none',
            cursor: 'pointer',
          }}
          id="sort-select"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelUz, opt.labelRu)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card" style={{ overflow: 'hidden' }}>
              <div className="skeleton skeleton-image" />
              <div style={{ padding: 'var(--space-3)' }}>
                <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-text" style={{ width: '60%' }} />
                <div className="skeleton skeleton-text" style={{ width: '100%', height: '36px', marginTop: '8px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <>
          <div className="product-grid">
            {products.map((product, idx) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 120, delay: Math.min(idx * 0.05, 0.3) }}
              >
                <ProductCard list="catalog" product={product} />
              </motion.div>
            ))}
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-outline btn-lg"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 40px',
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  opacity: loadingMore ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                id="load-more-btn"
              >
                {loadingMore ? (
                  <><Clock size={18} style={{ animation: 'pulse 1.5s infinite' }} /> {t('Yuklanmoqda...', 'Загрузка...')}</>
                ) : (
                  <><Plus size={18} /> {t(`Ko'proq ko'rsatish (${pagination!.total - products.length} ta qoldi)`, `Показать еще (осталось ${pagination!.total - products.length})`)}</>
                )}
              </button>
            </div>
          )}
        </>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--error)' }}><AlertTriangle size={64} /></div>
          <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)', color: 'var(--error)' }}>
            {t('Xatolik yuz berdi', 'Произошла ошибка')}
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            {t('Ma\'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.', 'Ошибка при загрузке данных. Пожалуйста, попробуйте еще раз.')}
          </p>
          <button className="btn btn-primary" onClick={() => fetchProducts(1, false)} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <RefreshCw size={18} style={{ marginRight: 8 }} />
            {t('Qayta urinish', 'Повторить')}
          </button>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-16)',
          color: 'var(--text-muted)',
        }}>
          <div style={{ marginBottom: 'var(--space-4)' }}><Search size={64} /></div>
          <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
            {t('Hech narsa topilmadi', 'Ничего не найдено')}
          </h3>
          <p style={{ fontSize: 'var(--text-sm)' }}>
            {t("Boshqa so'z bilan qidirib ko'ring yoki kategoriyani o'zgartiring", "Попробуйте использовать другие слова или изменить категорию")}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
