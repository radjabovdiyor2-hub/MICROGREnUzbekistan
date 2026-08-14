'use client';

import {
  BarChart, CheckCircle, Edit, Leaf, Moon, Package, Sun, Trash,
} from 'lucide-react';
import { CROP_DB, getBatchStatus, type Batch } from './growingData';

// Карточки партий выращивания: таймлайн фаз, прогресс, действия.
// Вынесено из AdminGrowing — самая объёмная часть экрана.

/** Партия вместе с посчитанной фазой: экран рисует именно её. */
export type EnrichedBatch = Batch & { info: ReturnType<typeof getBatchStatus> };


interface Props {
  filtered: EnrichedBatch[];
  enriched: EnrichedBatch[];
  statusColors: Record<string, string>;
  statusIcons: Record<string, React.ReactNode>;
  harvesting: string | null;
  fmt: (n: number) => string;
  handleEdit: (b: Batch) => void;
  harvestBatch: (id: string) => void;
  writeOffBatch: (id: string) => void;
  deleteBatch: (id: string) => void;
  /** Досрочно вывести партию на свет / подержать в темноте ещё сутки. */
  openDark: (id: string) => void;
  extendDark: (id: string) => void;
}

export function AdminGrowingCards({ filtered, enriched, statusColors, statusIcons, harvesting, fmt, handleEdit,
  harvestBatch, writeOffBatch, deleteBatch, openDark, extendDark }: Props) {
  return (
    <>
{/* Batch cards */}
{filtered.length === 0 ? (
  <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
    <Leaf size={48} style={{ opacity: 0.2, marginBottom: 'var(--space-2)' }} />
    <p style={{ fontSize: 'var(--text-sm)' }}>Нет посадок</p>
    <p style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Нажмите «Посадка» чтобы начать</p>
  </div>
) : (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {filtered.map(batch => {
      const crop = CROP_DB[batch.cropType] || CROP_DB['other'];
      const { info } = batch;
      const sc = statusColors[info.status] || 'var(--text-secondary)';
      const total = batch.darkDays + batch.lightDays + batch.shelfDays;
      const lightDate = new Date(new Date(batch.seedDate).getTime() + batch.darkDays * 86400000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      const readyDate = new Date(new Date(batch.seedDate).getTime() + (batch.darkDays + batch.lightDays) * 86400000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      const expDate = new Date(new Date(batch.seedDate).getTime() + total * 86400000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

      return (
        <div key={batch.id} className="card" style={{
          padding: '14px 16px', borderRadius: '14px',
          borderLeft: `4px solid ${sc}`,
          animation: info.alert ? 'pulse 2s infinite' : undefined,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
              background: `${crop.color}15`, color: crop.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Leaf size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {crop.nameRu}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>×{batch.trays} лотк.</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Посев: {new Date(batch.seedDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                {batch.note && ` · ${batch.note}`}
              </div>
              {batch.productName && (
                <div style={{ fontSize: '10px', color: 'var(--brand-primary)', fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Package size={10} /> → {batch.productName} (+{batch.harvestQty || batch.trays} шт)
                  {batch.costPrice ? <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>· с/с {fmt(batch.costPrice)} сум</span> : null}
                </div>
              )}
            </div>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
              background: `${sc}15`, color: sc,
            }}>
              {statusIcons[info.status]} {info.phase}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-tertiary)', gap: 1 }}>
              <div style={{ width: `${Math.min(info.progress, 100)}%`, background: sc, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>

          {/* Timeline dots */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: info.alert ? '8px' : 0 }}>
            <span>🌑 На свет: {lightDate}</span>
            <span>✅ Готов: {readyDate}</span>
            <span>⚠️ Срок: {expDate}</span>
          </div>

          {/* Alert */}
          {info.alert && (
            <div style={{
              padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
              background: info.status === 'expired' ? 'var(--error-bg)' : 'var(--success-bg)',
              color: info.status === 'expired' ? 'var(--error)' : 'var(--success)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{info.alert}</span>
              {info.status === 'ready' && (
                <button onClick={() => harvestBatch(batch.id)} disabled={harvesting === batch.id}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: 'var(--brand-primary-hover)', color: 'white', fontSize: '11px', fontWeight: 700,
                    opacity: harvesting === batch.id ? 0.6 : 1,
                  }}>
                  {harvesting === batch.id ? 'Добавляем...' : batch.productId ? 'Собрать → Склад' : 'Собрано'}
                </button>
              )}
            </div>
          )}

          {/* Actions for expired → write off */}
          {info.status === 'expired' && (
            <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '8px', background: 'var(--error-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--error)' }}>Просрочено! Списать?</div>
                <div style={{ fontSize: '10px', color: 'var(--error)' }}>
                  Убыток: {fmt((batch.costPrice || 0) * (batch.harvestQty || batch.trays))} сум
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => writeOffBatch(batch.id)} disabled={harvesting === batch.id}
                  style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--error)', color: 'var(--text-inverse)', fontSize: '11px', fontWeight: 700, opacity: harvesting === batch.id ? 0.6 : 1 }}>
                  {harvesting === batch.id ? 'Списываем...' : 'Списать'}
                </button>
              </div>
            </div>
          )}

          {/* Тёмная фаза: партия могла выйти раньше норматива */}
          {info.status === 'dark' && (
            <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                В темноте {info.daysInPhase} дн., по норме ещё {info.daysLeft}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {/* Всходы зависят от партии семян и температуры: держать
                    готовый лоток в темноте лишние сутки — терять день срока
                    хранения. Норму правим отдельно и только с согласия. */}
                <button onClick={() => openDark(batch.id)}
                  style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--warning)', color: 'var(--text-inverse)', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sun size={12} /> Открыть сейчас
                </button>
                <button onClick={() => extendDark(batch.id)}
                  style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Moon size={12} /> Ещё день
                </button>
              </div>
            </div>
          )}

          {/* General Actions (Edit/Delete) */}
          <div style={{ marginTop: info.status === 'expired' ? '6px' : '10px', display: 'flex', gap: '6px', justifyContent: 'flex-end', borderTop: info.status === 'expired' || info.status === 'harvested' ? 'none' : '1px solid var(--border)', paddingTop: info.status === 'expired' || info.status === 'harvested' ? '0' : '10px' }}>
            {info.status !== 'harvested' && info.status !== 'expired' && (
              <button onClick={() => handleEdit(batch)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Edit size={12} /> Изменить
              </button>
            )}
            <button onClick={() => deleteBatch(batch.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Trash size={12} /> Удалить
            </button>
          </div>
        </div>
      );
    })}
  </div>
)}

{/* Summary stats */}
{enriched.length > 0 && (
  <div className="card" style={{ padding: 'var(--space-4)' }}>
    <h4 style={{ fontWeight: 700, fontSize: '13px', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <BarChart size={14} /> Статистика посадок
    </h4>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
      {[
        { label: 'В темноте', count: enriched.filter(b => b.info.status === 'dark').length, color: 'var(--cat-1)', icon: <Moon size={14} /> },
        { label: 'На свету', count: enriched.filter(b => b.info.status === 'light').length, color: 'var(--warning)', icon: <Sun size={14} /> },
        { label: 'Готовы', count: enriched.filter(b => b.info.status === 'ready').length, color: 'var(--success)', icon: <CheckCircle size={14} /> },
        { label: 'Лотков', count: enriched.filter(b => b.info.status !== 'harvested').reduce((s, b) => s + b.trays, 0), color: 'var(--brand-primary)', icon: <Package size={14} /> },
      ].map((s, i) => (
        <div key={i} style={{ textAlign: 'center', padding: '8px', borderRadius: '10px', background: `${s.color}08` }}>
          <div style={{ color: s.color, marginBottom: 4 }}>{s.icon}</div>
          <div style={{ fontWeight: 800, fontSize: '16px', fontFamily: 'var(--font-display)' }}>{fmt(s.count)}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.label}</div>
        </div>
      ))}
    </div>
  </div>
)}
    </>
  );
}
