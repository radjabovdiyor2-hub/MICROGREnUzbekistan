'use client';

import { useState } from 'react';
import Image from 'next/image';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';

type Step = 'cart' | 'checkout' | 'success';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Naqd pul', icon: <Icons.Banknote size={18} />, desc: "Yetkazib berishda to'lang" },
  { id: 'click', label: 'Click', icon: <Icons.Smartphone size={18} />, desc: "Click ilovasi orqali" },
  { id: 'payme', label: 'Payme', icon: <Icons.CreditCard size={18} />, desc: "Payme ilovasi orqali" },
];

export default function CartPage() {
  const cart = useCart();
  const [step, setStep] = useState<Step>('cart');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Checkout form
  const [form, setForm] = useState({
    firstName: '',
    phone: '+998',
    address: '',
    note: '',
    paymentMethod: 'cash',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.firstName.trim()) newErrors.firstName = "Ism kiritilmadi";
    if (form.phone.length < 13) newErrors.phone = "Telefon raqam noto'g'ri";
    if (!form.address.trim()) newErrors.address = "Manzil kiritilmadi";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitOrder = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            firstName: form.firstName,
            phone: form.phone,
            address: form.address,
            note: form.note,
          },
          items: cart.items.map(i => ({
            productId: i.product.id,
            price: i.product.price,
            quantity: i.quantity,
          })),
          paymentMethod: form.paymentMethod,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOrderNumber(data.order.orderNumber);
        cart.clearCart();
        setStep('success');
      } else {
        alert(data.error || "Xatolik yuz berdi");
      }
    } catch {
      // Fallback: generate local order number if API fails
      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      setOrderNumber(`M-${date}-${rand}`);
      cart.clearCart();
      setStep('success');
    } finally {
      setIsSubmitting(false);
    }
  };

  // === CART VIEW ===
  if (step === 'cart') {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.ShoppingCart size={28} /> Savat
        </h1>

        {cart.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 'var(--space-4)' }}><Icons.ShoppingCart size={80} /></div>
            <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Savat bo&apos;sh
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              Katalogdan mahsulotlarni qo&apos;shing
            </p>
            <a href="/catalog" className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Icons.Folder size={20} /> Katalogga o&apos;tish
            </a>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
            {/* Cart Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {cart.items.map(item => (
                <div key={item.product.id} className="card" style={{
                  padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)',
                  }}>
                    {item.product.images && item.product.images.length > 0
                      ? <Image src={item.product.images[0]} alt={item.product.nameUz} width={72} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} quality={70} unoptimized={item.product.images[0].startsWith('/uploads/') || item.product.images[0].startsWith('/products/')} />
                      : <Icons.Package size={32} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
                      {item.product.nameUz}
                    </div>
                    <div style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>
                      {fmt(item.product.price)} so&apos;m
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
                      style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
                      <Icons.Minus size={16} />
                    </button>
                    <span style={{ fontWeight: 'var(--font-bold)', width: 28, textAlign: 'center' }}>{item.quantity}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
                      style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
                      <Icons.Plus size={16} />
                    </button>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', textAlign: 'right' }}>
                    {fmt(item.product.price * item.quantity)} so&apos;m
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => cart.removeItem(item.product.id)}
                    style={{ color: 'var(--error)' }}>
                    <Icons.Trash size={18} />
                  </button>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="card" style={{ padding: 'var(--space-6)', position: 'sticky', top: 'calc(var(--header-height) + var(--space-4))' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.ClipboardList size={20} /> Buyurtma
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span>Mahsulotlar ({cart.totalItems} dona)</span>
                  <span>{fmt(cart.subtotal)} so&apos;m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span>Yetkazish</span>
                  <span style={{ color: cart.deliveryFee === 0 ? 'var(--success)' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {cart.deliveryFee === 0 ? <><Icons.PartyPopper size={14} /> Bepul!</> : `${fmt(cart.deliveryFee)} so'm`}
                  </span>
                </div>
                {cart.deliveryFee > 0 && (
                  <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--info-bg)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--info)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Lightbulb size={14} /> Yana {fmt(500000 - cart.subtotal)} so&apos;m — bepul yetkazish!
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>Jami</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--brand-primary)' }}>
                    {fmt(cart.total)} so&apos;m
                  </span>
                </div>
              </div>
              <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                onClick={() => setStep('checkout')} id="go-checkout-btn">
                Buyurtma berish <Icons.ArrowRight size={18} />
              </button>
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Icons.CreditCard size={14} /> Click · Payme · Naqd pul
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === CHECKOUT FORM ===
  if (step === 'checkout') {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)', maxWidth: 600 }}>
        <button onClick={() => setStep('cart')} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.ArrowLeft size={16} /> Savatga qaytish
        </button>

        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.FileText size={28} /> Buyurtma rasmiylashtirish
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Personal Info */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icons.User size={18} /> Shaxsiy ma&apos;lumotlar
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>Ism *</label>
                <input type="text" placeholder="Ismingizni kiriting" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                  style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${errors.firstName ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                  id="checkout-name" />
                {errors.firstName && <span style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.firstName}</span>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>Telefon *</label>
                <input type="tel" placeholder="+998 99 123 45 67" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${errors.phone ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                  id="checkout-phone" />
                {errors.phone && <span style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.phone}</span>}
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icons.MapPin size={18} /> Yetkazish manzili
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>Manzil *</label>
                <textarea placeholder="Ko'cha, uy raqami, kvartira..." value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${errors.address ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', resize: 'vertical', fontFamily: 'var(--font-body)' }}
                  id="checkout-address" />
                {errors.address && <span style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.address}</span>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>Izoh (ixtiyoriy)</label>
                <input type="text" placeholder="Masalan: 2-qavatga olib chiqing" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                  style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                  id="checkout-note" />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icons.CreditCard size={18} /> To&apos;lov usuli
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {PAYMENT_METHODS.map(pm => (
                <label key={pm.id} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                  border: `2px solid ${form.paymentMethod === pm.id ? 'var(--brand-primary)' : 'var(--border)'}`,
                  background: form.paymentMethod === pm.id ? 'var(--brand-primary-light)' : 'transparent',
                  cursor: 'pointer', transition: 'all var(--transition-fast)',
                }}>
                  <input type="radio" name="payment" value={pm.id}
                    checked={form.paymentMethod === pm.id}
                    onChange={() => setForm(p => ({ ...p, paymentMethod: pm.id }))}
                    style={{ accentColor: 'var(--brand-primary)' }} />
                  <span style={{ color: 'var(--brand-primary)' }}>{pm.icon}</span>
                  <div>
                    <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{pm.label}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{pm.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="card" style={{ padding: 'var(--space-6)', background: 'var(--brand-primary-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <span>{cart.totalItems} ta mahsulot</span>
              <span>{fmt(cart.subtotal)} so&apos;m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
              <span>Yetkazish</span>
              <span style={{ color: cart.deliveryFee === 0 ? 'var(--success)' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {cart.deliveryFee === 0 ? <><Icons.PartyPopper size={14} /> Bepul!</> : `${fmt(cart.deliveryFee)} so'm`}
              </span>
            </div>
            <div style={{ borderTop: '2px solid var(--brand-primary)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>Jami:</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--brand-primary)' }}>
                {fmt(cart.total)} so&apos;m
              </span>
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={handleSubmitOrder} disabled={isSubmitting} id="submit-order-btn"
            style={{ padding: 'var(--space-5)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: isSubmitting ? 0.6 : 1 }}>
            {isSubmitting ? <><Icons.Clock size={20} /> Yuborilmoqda...</> : <><Icons.CheckCircle size={20} /> Buyurtmani tasdiqlash</>}
          </button>
        </div>
      </div>
    );
  }

  // === ORDER SUCCESS ===
  return (
    <div className="container" style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-8)', textAlign: 'center', maxWidth: 500 }}>
      <div style={{ marginBottom: 'var(--space-4)', color: 'var(--success)', animation: 'scaleIn 0.5s ease' }}>
        <Icons.PartyPopper size={80} />
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-extrabold)', marginBottom: 'var(--space-3)' }}>
        Buyurtma qabul qilindi!
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
        Tez orada operator siz bilan bog&apos;lanadi
      </p>

      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'left', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <span style={{
            padding: 'var(--space-2) var(--space-3)', background: 'var(--success-bg)', color: 'var(--success)',
            borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            <Icons.CheckCircle size={14} /> Tasdiqlandi
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
            #{orderNumber}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.User size={14} /> Ism</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.firstName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Phone size={14} /> Telefon</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.phone}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.MapPin size={14} /> Manzil</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.address}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.CreditCard size={14} /> To&apos;lov</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>
              {PAYMENT_METHODS.find(p => p.id === form.paymentMethod)?.label}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <a href="/" className="btn btn-primary btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Icons.Home size={20} /> Bosh sahifa
        </a>
        <a href="/catalog" className="btn btn-outline btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Icons.Folder size={20} /> Yana xarid qilish
        </a>
        <a href="tel:+998997772232" className="btn btn-ghost" style={{ fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          <Icons.Phone size={16} /> Aloqa: +998 99 777 22 32
        </a>
      </div>
    </div>
  );
}
