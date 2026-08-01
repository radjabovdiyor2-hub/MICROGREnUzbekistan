'use client';

// Правила начисления реферальных бонусов — раскрывающийся блок.
// Вынесен из ReferralSection: показывается по флагу и ни от чего больше
// не зависит.

interface Props {
  t: (ru: string, uz: string) => string;
}

export function ReferralRules({ t }: Props) {
  return (
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          {t('Qanday ishlaydi?', 'Как это работает?')}
        </div>
        <div>
          {t(
            "1. O'z kodingizni do'stlarga va fermerlarga ulashing\n2. Ular ro'yxatdan o'tganda — siz 5 000 so'm bonus olasiz\n3. Ular xarid qilganda — har bir xariddan 3% bonus olasiz\n4. Yangi foydalanuvchi ham 2 000 so'm bonus oladi\n5. Bonuslarni keyingi xaridlarda ishlating (50 000+ so'mdan)",
            "1. Поделитесь кодом с мастерами и друзьями\n2. Они регистрируются — вы получаете 5 000 сум бонус\n3. Они покупают — вы получаете 3% от каждой покупки\n4. Новый пользователь тоже получит 2 000 сум бонус\n5. Бонусы можно потратить на покупки (от 50 000 сум)"
          ).split('\n').map((line, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{line}</div>
          ))}
        </div>
      </div>
  );
}
