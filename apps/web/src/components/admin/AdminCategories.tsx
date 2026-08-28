'use client';

import { AdminCategoryForm } from './AdminCategoryForm';
import { AdminNotice } from './AdminNotice';
import { AdminSearch, matchesQuery } from './AdminSearch';
import { useFeedback } from './AdminFeedback';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Trash } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Категории каталога.
//
// Таблица была, интерфейса не было: список правился только сидом базы.
//
// Важный нюанс: SEO-тексты категорий живут в коде (lib/seo/categories.ts)
// и участвуют в статической генерации страниц — выносить их в базу
// значило бы замедлить выдачу. Поэтому у категории без SEO-описания
// лендинг /catalog/<slug> не построится, и мы это прямо показываем,
// а не оставляем владельца гадать, почему страницы нет.
// ══════════════════════════════════════════════════════════════════════

interface Category {
  id: string; slug: string; nameUz: string; nameRu: string;
  icon: string | null; order: number; productCount: number; seoMissing: boolean;
}

export function AdminCategories({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const notify = useFeedback();
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();

  const [error, setError] = useState('');
  // Поиска не было: категорий немного, но со временем их становится больше,
  // а порядок в каталоге задан вручную — прокрутка глазами тут дороже всего.
  const [query, setQuery] = useState('');
  const [warning, setWarning] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [slug, setSlug] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameUz, setNameUz] = useState('');
  const [icon, setIcon] = useState('');

  const { data: categories = [], isLoading: loading } = useQuery<Category[]>({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const res = await fetch('/api/admin/categories', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') return data.categories;
      throw new Error(data.error || t('Не удалось загрузить', "Yuklab bo'lmadi"));
    }
  });

  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setWarning('');
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ slug, nameRu, nameUz, icon, order: categories.length }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('Ошибка', 'Xatolik')); return; }
      if (data.warning) setWarning(data.warning);
      setSlug(''); setNameRu(''); setNameUz(''); setIcon('');
      setShowForm(false);
      await load();
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    }
  };

  const rename = async (cat: Category, patch: Partial<Category>) => {
    await fetch('/api/admin/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: cat.id, ...patch }),
    });
    await load();
  };

  /**
   * Удаление рубрики. Спрашиваем, хотя сервер и подстрахован.
   *
   * Роут откажет, если внутри есть товары (`/api/admin/categories` DELETE),
   * — но пустую рубрику он удалит молча и сразу, а восстановить её нельзя:
   * вместе с ней уходят порядок в каталоге и SEO-слаг.
   */
  const remove = async (cat: Category) => {
    const name = cat.nameRu || cat.nameUz;
    const ok = await notify.confirm({
      title: t(`Удалить категорию «${name}»?`, `«${name}» kategoriyasi o'chirilsinmi?`),
      detail: t(
        'Если в ней есть товары — удаление не пройдёт, сначала перенесите их. Пустая исчезнет без возможности вернуть.',
        "Ichida tovarlar bo'lsa — o'chmaydi, avval ko'chiring. Bo'sh bo'lsa qaytarib bo'lmaydi.",
      ),
      confirmText: t('Удалить', "O'chirish"),
      danger: true,
    });
    if (!ok) return;

    notify.undoable({
      text: t(`Удаляю «${cat.nameRu}»…`, `«${cat.nameRu}» o'chirilmoqda…`),
      undoneText: t('Отменено — категория на месте', 'Bekor qilindi'),
      run: async () => {
        setError('');
        const res = await fetch(`/api/admin/categories?id=${cat.id}`, {
          method: 'DELETE', credentials: 'same-origin',
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || t('Не удалось удалить', "O'chirib bo'lmadi"));
        await load();
      },
    });
  };

  const visible = categories.filter((c) => matchesQuery(query, c.nameRu, c.nameUz, c.slug));

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <button onClick={() => setShowForm(!showForm)} className="btn btn-primary"
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Plus size={16} /> {t('Новая категория', 'Yangi kategoriya')}
      </button>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <AdminSearch value={query} onChange={setQuery}
          placeholder={t('Поиск категории', 'Kategoriya qidirish')} width={200} />
      </div>

      <AdminNotice>{error}</AdminNotice>
      {warning && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, background: 'var(--warning-bg)',
          color: 'var(--warning)', fontSize: 'var(--text-sm)', fontWeight: 600,
        }}>
          {warning}
        </div>
      )}

      {showForm && (
        <AdminCategoryForm
          nameUz={nameUz}
          setNameUz={setNameUz}
          nameRu={nameRu}
          setNameRu={setNameRu}
          slug={slug}
          setSlug={setSlug}
          icon={icon}
          setIcon={setIcon}
          create={create}
          t={t}
          inputStyle={inputStyle}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
            {t('Загрузка…', 'Yuklanmoqda…')}
          </div>
        ) : visible.map(cat => (
          <div key={cat.id} className="card" style={{
            padding: 'var(--space-4)', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 22 }}>{cat.icon || '📦'}</span>

            <div style={{ flex: 1, minWidth: 180 }}>
              <input
                defaultValue={cat.nameRu}
                onBlur={e => e.target.value !== cat.nameRu && rename(cat, { nameRu: e.target.value })}
                style={{ ...inputStyle, padding: '4px 8px', fontWeight: 600 }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 3 }}>
                /{cat.slug} · {cat.productCount} {t('товаров', 'mahsulot')}
              </div>
              {cat.seoMissing && (
                <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 3 }}>
                  ⚠ {t('нет SEO-описания — страница категории не построится',
                        'SEO tavsifi yo\'q — kategoriya sahifasi qurilmaydi')}
                </div>
              )}
            </div>

            <button
              onClick={() => remove(cat)}
              disabled={cat.productCount > 0}
              title={cat.productCount > 0
                ? t('Сначала перенесите товары', 'Avval mahsulotlarni ko\'chiring')
                : t('Удалить', "O'chirish")}
              style={{
                background: 'none', border: 'none',
                cursor: cat.productCount > 0 ? 'not-allowed' : 'pointer',
                color: cat.productCount > 0 ? 'var(--text-muted)' : 'var(--error)',
                opacity: cat.productCount > 0 ? 0.4 : 1,
              }}>
              <Trash size={16} />
            </button>
          </div>
        ))}

        {!loading && !visible.length && (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Layers size={28} style={{ marginBottom: 8 }} />
            <div>{t('Категорий нет', 'Kategoriyalar yo\'q')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
