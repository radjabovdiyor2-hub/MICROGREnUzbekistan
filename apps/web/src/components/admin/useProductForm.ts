'use client';

import { useState } from 'react';
import { EMPTY_FORM, type Product } from './productTypes';

// Форма товара: открытие, заполнение из карточки, сохранение, удаление.
// Вынесено из AdminProducts: файл перерос 200 строк.

/** Slug строится из названия, пока товар новый: у существующего его менять
 *  нельзя — на него уже могут вести ссылки. */
const autoSlug = (name: string) =>
  name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);

export function useProductForm(refresh: () => void) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleNameChange = (val: string) => {
    setForm(f => ({ ...f, nameUz: val, slug: editingId ? f.slug : autoSlug(val) }));
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };


  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImages([]);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      nameUz: p.nameUz, nameRu: p.nameRu, slug: '',
      price: String(p.price), oldPrice: p.oldPrice ? String(p.oldPrice) : '',
      costPrice: p.costPrice ? String(p.costPrice) : '', categoryId: p.category?.id || '', stock: String(p.stock),
      sku: '', brand: '', descriptionUz: '', unit: p.unit || 'шт',
      isFeatured: p.isFeatured, isOnSale: p.isOnSale,
    });
    setImages(p.images || []);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.nameUz || !form.price || !form.categoryId) {
      setFormError("Nom, narx va kategoriyani to'ldiring");
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        nameUz: form.nameUz,
        nameRu: form.nameRu || form.nameUz,
        price: parseInt(form.price),
        categoryId: form.categoryId,
        // Остаток дробный: салат считается килограммами, и после
        // инвентаризации на складе может лежать 8.7.
        stock: parseFloat(String(form.stock).replace(',', '.')) || 0,
        unit: form.unit || 'шт',
        isFeatured: form.isFeatured,
        isOnSale: form.isOnSale,
      };
      if (form.oldPrice) payload.oldPrice = parseInt(form.oldPrice);
      else if (editingId) payload.oldPrice = null;
      payload.costPrice = form.costPrice ? parseInt(form.costPrice) : null;
      if (form.brand) payload.brand = form.brand;
      if (form.sku) payload.sku = form.sku;
      if (form.descriptionUz) payload.descriptionUz = form.descriptionUz;
      payload.images = images;

      if (editingId) {
        payload.id = editingId;
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        payload.slug = form.slug || autoSlug(form.nameUz) + '-' + Date.now().toString(36);
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      console.error('Save error:', err);
      setFormError('Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  return {
    showForm, setShowForm, editingId, form, setForm, saving, formError, setFormError,
    images, setImages, handleNameChange, removeImage, openAdd, openEdit, handleSubmit,
  };
}
