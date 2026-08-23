'use client';

import { useState } from 'react';
import { ArrowLeft, Check, CloudOff, Tag } from 'lucide-react';

import { AdminPOSCartItems } from './AdminPOSCartItems';
import { AdminPOSProducts } from './AdminPOSProducts';
import { AdminPOSReceiptCard } from './AdminPOSReceiptCard';
import { snapshotTime } from '@/lib/customers/mapSnapshot';

import { PosQueueBanner } from './PosQueueBanner';
import { usePosSession } from './usePosSession';
import type { PosCustomer } from './AdminPOSTypes';
import type { SaleResultState } from './usePosSubmit';

import { PosSaleFooter } from './PosSaleFooter';

// ══════════════════════════════════════════════════════════════════════
// Касса прямо в панели точки: продать, не уходя с карты.
//
// Ради этого карта и открывается в поле. Раньше по точке можно было
// позвонить, доехать и отметить визит — а продать нельзя: продажа жила на
// другой вкладке, куда надо было уйти, найти клиента поиском заново и
// потерять карту с маршрутом.
//
// Касса при этом ОДНА: прайс, корзина, договорные цены и все проверки
// чека — общие с вкладкой «Продажи» (usePosSession). Здесь только
// разметка под телефон в чужом дворе: крупные кнопки, ничего лишнего.
//
// Деньги клиента (сколько он потратил за всё время) продавцу по-прежнему
// скрыты — их прячет `maskSum` на уровне карты. Цены товаров и итог чека
// не скрываются никогда: без них продавать нечем, и в кассе он их видит.
// ══════════════════════════════════════════════════════════════════════

const text = {
  back: { ru: 'К точке', uz: 'Nuqtaga' },
  contract: { ru: 'Договорные цены применены', uz: 'Kelishilgan narxlar qoʻllandi' },
  queued: {
    ru: 'Чек принят. Связи нет — уйдёт, когда появится',
    uz: 'Chek qabul qilindi. Aloqa yoʻq — paydo boʻlganda yuboriladi',
  },
  done: { ru: 'Готово', uz: 'Tayyor' },
  offline: { ru: 'Связи нет — цены', uz: 'Aloqa yoʻq — narxlar' },
};

interface Props {
  customer: PosCustomer;
  lang: 'ru' | 'uz';
  sellerName: string;
  /**
   * Где продают.
   *
   * С точки на карте — `field`: человек стоит у клиента, и в CRM у такого
   * чека адрес заведения, а не «Продажа в магазине». Из карточки клиента за
   * столом — `counter`: это та же касса, просто с уже выбранным покупателем.
   */
  origin: 'counter' | 'field';
  onClose: () => void;
  /** Чек прошёл или лёг в очередь — вызывающий отмечает визит и обновляет данные. */
  onSold: (result: SaleResultState) => void;
}

export function PosSaleSheet({ customer, lang, sellerName, origin, onClose, onSold }: Props) {
  const [category, setCategory] = useState('all');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const s = usePosSession({ initialCustomer: customer, origin, sellerName, onSale: onSold });
  const submit = s.submit;

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)',
    borderRadius: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ArrowLeft size={14} /> {text.back[lang]}
      </button>
      <strong style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {customer.name}
      </strong>
    </div>
  );

  // ── Чек пробит ─────────────────────────────────────────────────────
  if (submit.saleResult) {
    const result = submit.saleResult;
    return (
      <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
        {header}

        {result.queued ? (
          // Номера ещё нет — сервер его не выдавал. Показывать пустой чек
          // нельзя: продавец решит, что продажа не прошла, и пробьёт вторую.
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--warning)' }}>
            <CloudOff size={18} />
            <span style={{ fontSize: 'var(--text-sm)' }}>
              {text.queued[lang]} · {s.fmt(result.total)}
            </span>
          </div>
        ) : (
          <AdminPOSReceiptCard saleResult={result} fmt={s.fmt} />
        )}

        <button type="button" className="btn btn-primary" onClick={onClose} style={{ minHeight: 44 }}>
          <Check size={16} /> {text.done[lang]}
        </button>
      </div>
    );
  }

  // ── Набор чека ─────────────────────────────────────────────────────
  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      {header}

      {s.contractCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--brand-primary)' }}>
          <Tag size={13} /> {text.contract[lang]}
        </div>
      )}

      {/* Связи нет, но прайс есть: это не поломка, а работа по снимку —
          та же плашка и та же логика, что у карты. */}
      {s.snapshotAt !== null && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--warning)' }}>
          <CloudOff size={13} /> {text.offline[lang]} {snapshotTime(s.snapshotAt)}
        </div>
      )}

      <PosQueueBanner queue={submit.queue} lang={lang} />

      {/* Сетка товаров ограничена по высоте: под ней должны помещаться
          корзина и кнопка «Продать», иначе на телефоне до неё не долистать. */}
      <div style={{ maxHeight: '38vh', overflowY: 'auto' }}>
        <AdminPOSProducts
          products={s.products}
          cart={s.cart}
          loading={s.loading}
          searchQuery={s.searchQuery}
          setSearchQuery={s.setSearchQuery}
          selectedCategory={category}
          setSelectedCategory={setCategory}
          addToCart={s.addToCart}
          fmt={s.fmt}
          inputStyle={inputStyle}
        />
      </div>

      {s.cart.length > 0 && (
        <div style={{ maxHeight: '30vh', display: 'flex', flexDirection: 'column' }}>
          <AdminPOSCartItems
            cart={s.cart}
            editingPriceId={editingPriceId}
            setEditingPriceId={setEditingPriceId}
            editPriceValue={editPriceValue}
            setEditPriceValue={setEditPriceValue}
            updateQuantity={s.updateQuantity}
            setQuantity={s.setQuantity}
            updatePrice={s.updatePrice}
            setPriceReason={s.setPriceReason}
            removeFromCart={s.removeFromCart}
            fmt={s.fmt}
          />
        </div>
      )}

      <PosSaleFooter
        lang={lang}
        total={s.total}
        fmt={s.fmt}
        paymentMethod={submit.paymentMethod}
        setPaymentMethod={(v) => {
          submit.setPaymentMethod(v);
          // Имя должника — это и есть клиент точки. Заставлять продавца
          // печатать название ресторана, по которому он открыл карточку,
          // значит выдумывать работу на ровном месте.
          if (v === 'debt' && !submit.debtInfo.personName) {
            submit.setDebtInfo({
              ...submit.debtInfo,
              personName: customer.name,
              phone: customer.phone ?? '',
            });
          }
        }}
        debtInfo={submit.debtInfo}
        setDebtInfo={submit.setDebtInfo}
        processing={submit.processing}
        onSell={submit.processSale}
        disabled={s.cart.length === 0}
      />
    </div>
  );
}
