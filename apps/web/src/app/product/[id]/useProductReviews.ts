'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrCreateGuestId } from './productPageParts';
import type { Review } from './ProductReviews';

export function useProductReviews({
  productId,
  activeTab,
  setActiveTab,
  t,
  onReviewAdded,
}: {
  productId: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  t: (uz: string, ru: string) => string;
  onReviewAdded?: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [ratingForm, setRatingForm] = useState({ name: '', stars: 0, comment: '' });
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const reviewsAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== 'reviews' || reviewsLoaded) return;
    setReviewsLoading(true);
    fetch(`/api/reviews?productId=${productId}`)
      .then((r) => r.json())
      .then((data) => {
        setReviews(data.reviews || []);
        setReviewsLoaded(true);
      })
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [activeTab, productId, reviewsLoaded]);

  const handleRatingClick = useCallback(() => {
    setActiveTab('reviews');
    setTimeout(() => {
      reviewsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [setActiveTab]);

  const handleSubmitReview = async () => {
    if (ratingForm.stars === 0) {
      setSubmitError(t('Reyting tanlang', 'Выберите оценку'));
      return;
    }
    if (!ratingForm.name.trim()) {
      setSubmitError(t('Ismingizni kiriting', 'Введите ваше имя'));
      return;
    }
    setSubmitError('');
    setSubmitState('submitting');
    const optimisticReview: Review = {
      id: `opt-${Date.now()}`,
      rating: ratingForm.stars,
      comment: ratingForm.comment.trim() || null,
      createdAt: new Date().toISOString(),
      user: { firstName: ratingForm.name.trim(), avatarUrl: null },
      _optimistic: true,
    };
    setReviews((prev) => [optimisticReview, ...prev]);
    try {
      const guestId = getOrCreateGuestId();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId,
          guestName: ratingForm.name.trim(),
          productId,
          rating: ratingForm.stars,
          comment: ratingForm.comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === optimisticReview.id
              ? { ...optimisticReview, id: data.review.id, _optimistic: false }
              : r,
          ),
        );
        setSubmitState('done');
        setRatingForm({ name: '', stars: 0, comment: '' });
        onReviewAdded?.();
      } else {
        throw new Error(data.error);
      }
    } catch {
      setReviews((prev) => prev.filter((r) => r.id !== optimisticReview.id));
      setSubmitState('error');
      setSubmitError(t("Xatolik yuz berdi. Qayta urinib ko'ring.", 'Произошла ошибка. Попробуйте ещё раз.'));
    }
  };

  return {
    reviews,
    reviewsLoading,
    ratingForm,
    setRatingForm,
    submitState,
    submitError,
    reviewsAnchorRef,
    handleRatingClick,
    handleSubmitReview,
  };
}
