'use client';

import { useLang } from '@/components/providers/LangProvider';
import { Clock } from 'lucide-react';
import { GROW_STAGES, StageIcon } from './instagramFeedData';

// Полоса стадий выращивания. Вынесено из InstagramFeed: файл перерос
// 200 строк, а к самой ленте Instagram этот блок отношения не имеет.

export function GrowingTimeline({ activeStage, setActiveStage }: {
  activeStage: number;
  setActiveStage: (i: number) => void;
}) {
  const { t } = useLang();

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)',
      marginBottom: 'var(--space-6)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: 'var(--space-4)',
        fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600,
      }}>
        <Clock size={14} />
        {t('7 kunlik o\'sish sikli', '7-дневный цикл выращивания')}
      </div>

      {/* Timeline Steps */}
      <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
        {/* Progress line */}
        <div style={{
          position: 'absolute', top: 20, left: 20, right: 20, height: 3,
          background: 'var(--bg-tertiary)', borderRadius: 2, zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', top: 20, left: 20, height: 3,
          background: `linear-gradient(90deg, ${GROW_STAGES[0].color}, ${GROW_STAGES[activeStage].color})`,
          borderRadius: 2, zIndex: 1,
          width: `${(activeStage / (GROW_STAGES.length - 1)) * (100 - 12)}%`,
          transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }} />

        {GROW_STAGES.map((stage, i) => (
          <button key={i} onClick={() => setActiveStage(i)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '8px', background: 'none', border: 'none', cursor: 'pointer',
              position: 'relative', zIndex: 2, padding: '0 4px',
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-full)',
              background: i <= activeStage
                ? `linear-gradient(135deg, ${stage.color}, ${stage.color}DD)`
                : 'var(--bg-tertiary)',
              color: i <= activeStage ? 'white' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease',
              boxShadow: i === activeStage ? `0 4px 16px ${stage.color}40` : 'none',
              transform: i === activeStage ? 'scale(1.15)' : 'scale(1)',
            }}>
              <StageIcon type={stage.icon} size={18} />
            </div>
            <span style={{
              fontSize: '10px', fontWeight: 700,
              color: i === activeStage ? stage.color : 'var(--text-muted)',
              transition: 'color 0.3s',
            }}>
              {t(`${stage.day}-kun`, `${stage.day} день`)}
            </span>
          </button>
        ))}
      </div>

      {/* Active Stage Info */}
      <div style={{
        marginTop: 'var(--space-4)', padding: 'var(--space-4)',
        background: `${GROW_STAGES[activeStage].color}0A`,
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${GROW_STAGES[activeStage].color}20`,
        transition: 'all 0.3s ease',
      }}>
        <div style={{
          fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)',
          color: GROW_STAGES[activeStage].color, marginBottom: '4px',
          fontFamily: 'var(--font-display)',
        }}>
          {t(GROW_STAGES[activeStage].titleUz, GROW_STAGES[activeStage].titleRu)}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t(GROW_STAGES[activeStage].descUz, GROW_STAGES[activeStage].descRu)}
        </div>
      </div>
    </div>
  );
}
