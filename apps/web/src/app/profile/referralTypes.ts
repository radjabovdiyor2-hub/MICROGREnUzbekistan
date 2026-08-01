// Форма реферальных данных. Вынесена из ReferralSection.

export interface ReferralData {
  referralCode?: string;
  referralCount?: number;
  referredBy?: string | null;
}
