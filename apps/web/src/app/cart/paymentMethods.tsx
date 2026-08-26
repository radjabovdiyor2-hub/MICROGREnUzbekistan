import { Banknote, CreditCard, Smartphone } from 'lucide-react';

// Полный каталог способов оплаты. Какие из них показывать — решает
// настройка `payment.methods`: она редактировалась в админке, но оформление
// её не читало и рисовало весь список. Подсказка настройки при этом обещала,
// что пустой список «сломает оформление» — то есть настройка выглядела
// работающей, ничего не делая.
//
// Лежит отдельно от CheckoutForm, потому что нужен ещё и экрану успеха
// (CartOrderSuccess): тот импортировал константу из компонента формы, хотя
// формы на экране успеха уже нет.

// Click и Payme отсюда убраны намеренно. Кнопки рисовались, клиент выбирал
// способ — и ничего не происходило: платёжную ссылку не создаёт ни один
// участок кода, а вебхуки /api/payment/* ждут рабочих merchant-контрактов.
// Оплата фактически идёт при получении, и список теперь говорит именно это.
// Вернуть строку сюда без создания платежа — значит вернуть ложное обещание.
export const PAYMENT_METHODS = [
  { id: 'cash', labelUz: 'Naqd pul', labelRu: 'Наличные', icon: <Banknote size={18} />, descUz: "Yetkazib berishda to'lang", descRu: "Оплата при доставке" },
  { id: 'card', labelUz: 'Karta', labelRu: 'Карта', icon: <CreditCard size={18} />, descUz: "Yetkazib berishda terminal orqali", descRu: "Терминалом при доставке" },
  { id: 'transfer', labelUz: "O'tkazma", labelRu: 'Перевод', icon: <Smartphone size={18} />, descUz: "Karta raqamiga o'tkazma", descRu: "Переводом на карту" },
];

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

interface PickerProps {
  methods: PaymentMethod[];
  selected: string;
  onSelect: (id: string) => void;
  t: (uz: string, ru: string) => string;
}

/** Список радио-кнопок способов оплаты. */
export function PaymentMethodPicker({ methods, selected, onSelect, t }: PickerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {methods.map(pm => (
        <label key={pm.id} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
          border: `2px solid ${selected === pm.id ? 'var(--brand-primary)' : 'var(--border)'}`,
          background: selected === pm.id ? 'var(--brand-primary-light)' : 'transparent',
          cursor: 'pointer', transition: 'all var(--transition-fast)',
        }}>
          <input type="radio" name="payment" value={pm.id}
            checked={selected === pm.id}
            onChange={() => onSelect(pm.id)}
            style={{ accentColor: 'var(--brand-primary)' }} />
          <span style={{ color: 'var(--brand-primary)' }}>{pm.icon}</span>
          <div>
            <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{t(pm.labelUz, pm.labelRu)}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t(pm.descUz, pm.descRu)}</div>
          </div>
        </label>
      ))}
    </div>
  );
}
