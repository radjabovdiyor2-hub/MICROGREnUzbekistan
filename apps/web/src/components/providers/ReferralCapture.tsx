'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

// Closes the referral loop:
//  1) capture ?ref=CODE from the landing URL and remember it,
//  2) once the visitor is logged in, apply it (server ignores self-referral /
//     already-referred), then clear it so it only fires once.
// Without this, shared referral links never set `referredBy`, so referrers
// never earn the 3% bonus that api/orders pays out.
const REF_KEY = 'Microgreen-ref';

export function ReferralCapture() {
  const { dbUser } = useAuth();

  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref && ref.trim()) localStorage.setItem(REF_KEY, ref.trim());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!dbUser?.id) return;
    let ref: string | null = null;
    try { ref = localStorage.getItem(REF_KEY); } catch { /* ignore */ }
    if (!ref) return;
    fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: dbUser.id, referralCode: ref }),
    }).catch(() => { /* ignore */ }).finally(() => {
      try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
    });
  }, [dbUser?.id]);

  return null;
}
