'use client';

import type { Dispatch, SetStateAction } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle, Clock, MessageSquare, Send, Star } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { StarRow } from './productPageParts';

// Вкладка отзывов на карточке товара: сводка рейтинга, список и форма.
// Вынесена из ProductPageClient — вкладка показывается по условию и от
// остальной карточки не зависит.

export interface ReviewUser {
  firstName: string | null;
  avatarUrl: string | null;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: ReviewUser;
  _optimistic?: boolean;
}

interface RatingForm {
  name: string;
  stars: number;
  comment: string;
}

interface Props {
  activeTab: string;
  product: { rating: number; reviewCount: number };
  reviews: Review[];
  reviewsLoading: boolean;
  ratingForm: RatingForm;
  setRatingForm: Dispatch<SetStateAction<RatingForm>>;
  submitState: 'idle' | 'submitting' | 'done' | 'error';
  submitError: string;
  handleSubmitReview: () => void;
}

export function ProductReviews({
  activeTab, product, reviews, reviewsLoading, ratingForm, setRatingForm,
  submitState, submitError, handleSubmitReview,
}: Props) {
  const { t } = useLang();

  // Распределение оценок по звёздам — считается только здесь, поэтому и живёт
  // рядом с гистограммой, а не в теле карточки товара.
  const getRatingDistribution = (revs: Review[]) => {
    const counts = [0, 0, 0, 0, 0];
    revs.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++; });
    return counts;
  };

  return (
    <>
  {/* Reviews tab */}
  {activeTab === 'reviews' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Rating summary */}
      {(reviews.length > 0 || product.reviewCount > 0) && (
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'clamp(3rem,8vw,4rem)', color: 'var(--brand-primary)', lineHeight: 1 }}>{product.rating.toFixed(1)}</div>
              <StarRow value={Math.round(product.rating)} readOnly />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{product.reviewCount} {t("ta sharh", "отзывов")}</div>
            </div>
            <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[5, 4, 3, 2, 1].map((star) => {
                const dist = getRatingDistribution(reviews);
                const count = dist[star - 1];
                const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', width: 16, textAlign: 'right' }}>{star}</span>
                    <Star fill="currentColor" strokeWidth={1} size={12} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: star >= 4 ? 'var(--success)' : star === 3 ? 'var(--warning)' : 'var(--error)', borderRadius: 4, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Reviews list — shown FIRST so user can read before writing */}
      {reviewsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton" style={{ height: 14, width: '40%' }} />
                  <div className="skeleton" style={{ height: 12, width: '30%' }} />
                </div>
              </div>
              <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 4 }} />
              <div className="skeleton" style={{ height: 14, width: '80%' }} />
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <MessageSquare size={48} style={{ marginBottom: 'var(--space-3)', opacity: 0.4 }} />
          <p>{t("Hali sharhlar yo'q. Birinchi bo'lib fikr qoldiring!", "Отзывов пока нет. Будьте первым!")}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {reviews.map((review) => (
            <div key={review.id} className="card" style={{ padding: 'var(--space-4)', opacity: review._optimistic ? 0.75 : 1, transition: 'opacity 0.3s ease' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', overflow: 'hidden' }}>
                  {review.user.avatarUrl
                    ? <Image src={review.user.avatarUrl} alt="" width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} unoptimized />
                    : (review.user.firstName?.[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{review.user.firstName || t("Anonim", "Аноним")}</span>
                      {review._optimistic && <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>{t("Saqlanmoqda...", "Сохраняется...")}</span>}
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{new Date(review.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                  <StarRow value={review.rating} readOnly />
                  {review.comment && <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{review.comment}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit form — BELOW the list (Amazon / WB order) */}
      <div className="card" style={{ padding: 'var(--space-6)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={20} style={{ color: 'var(--brand-primary)' }} />
          {t("Sharh qoldiring", "Оставить отзыв")}
        </h3>
        {submitState === 'done' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: 'var(--space-4)', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontWeight: 'var(--font-medium)' }}>
            <CheckCircle size={20} /> {t("Sharh muvaffaqiyatli qo'shildi!", "Отзыв успешно добавлен!")}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Ismingiz *", "Ваше имя *")}</label>
              <input type="text" value={ratingForm.name} onChange={(e) => setRatingForm((p) => ({ ...p, name: e.target.value }))} placeholder={t("Ismingizni kiriting", "Введите ваше имя")} id="review-name"
                style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>{t("Baho *", "Оценка *")}</label>
              <StarRow value={ratingForm.stars} onChange={(v) => setRatingForm((p) => ({ ...p, stars: v }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Izoh (ixtiyoriy)", "Комментарий (необязательно)")}</label>
              <textarea value={ratingForm.comment} onChange={(e) => setRatingForm((p) => ({ ...p, comment: e.target.value }))} placeholder={t("Mahsulot haqida fikringizni yozing...", "Напишите ваш отзыв о товаре...")} rows={3} id="review-comment"
                style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)' }} />
            </div>
            {submitError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: 'var(--space-3)', background: 'var(--error-bg)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>
                <AlertTriangle size={16} /> {submitError}
              </div>
            )}
            <button className="btn btn-primary" onClick={handleSubmitReview} disabled={submitState === 'submitting'} id="submit-review-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: submitState === 'submitting' ? 0.6 : 1 }}>
              {submitState === 'submitting' ? <><Clock size={16} /> {t("Yuborilmoqda...", "Отправка...")}</> : <><Send size={16} /> {t("Sharh yuborish", "Отправить отзыв")}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )}
    </>
  );
}
