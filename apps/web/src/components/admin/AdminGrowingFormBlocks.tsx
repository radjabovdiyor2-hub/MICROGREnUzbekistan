'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { PlantingRequirement } from './growingData';

// Два самостоятельных блока формы посадки: редактор цикла с полосой сроков и
// предпросмотр списания сырья. Вынесены из AdminGrowingForm — там осталось то,
// что относится к самой партии (культура, количество, даты, товар).

/** Подпись поля формы посадки. Была скопирована в семи местах подряд. */
export const fieldLabel: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontWeight: 600,
  marginBottom: 4,
  display: 'block',
};

const stageLabel: CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  marginBottom: 2,
  display: 'block',
};

interface CycleProps {
  customDark: number;
  setCustomDark: Dispatch<SetStateAction<number>>;
  customLight: number;
  setCustomLight: Dispatch<SetStateAction<number>>;
  customShelf: number;
  setCustomShelf: Dispatch<SetStateAction<number>>;
  inputStyle: CSSProperties;
}

/** Цикл выращивания: три срока и наглядная полоса их соотношения. */
export function GrowingCycleFields({
  customDark, setCustomDark, customLight, setCustomLight,
  customShelf, setCustomShelf, inputStyle,
}: CycleProps) {
  const stageInput = { ...inputStyle, padding: '6px 8px' };

  return (
    <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>Цикл выращивания (Дни)</span>
        <span>Всего: {customDark + customLight + customShelf} дней</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div>
          <label style={{ ...stageLabel, color: 'var(--cat-1)' }}>🌑 Темнота (груз)</label>
          <input type="number" min={0} value={customDark} onChange={e => setCustomDark(Number(e.target.value))} style={stageInput} />
        </div>
        <div>
          <label style={{ ...stageLabel, color: 'var(--warning)' }}>☀️ На свету</label>
          <input type="number" min={0} value={customLight} onChange={e => setCustomLight(Number(e.target.value))} style={stageInput} />
        </div>
        <div>
          <label style={{ ...stageLabel, color: 'var(--success)' }}>📦 Хранение</label>
          <input type="number" min={0} value={customShelf} onChange={e => setCustomShelf(Number(e.target.value))} style={stageInput} />
        </div>
      </div>

      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        <div style={{ flex: customDark, background: 'var(--cat-1)', borderRadius: '4px 0 0 4px' }} title={`Темно: ${customDark} дн`} />
        <div style={{ flex: customLight, background: 'var(--warning)' }} title={`Свет: ${customLight} дн`} />
        <div style={{ flex: customShelf, background: 'var(--success)', borderRadius: '0 4px 4px 0' }} title={`Хранение: ${customShelf} дн`} />
      </div>
    </div>
  );
}

interface RequirementsProps {
  requirements: PlantingRequirement[];
  estimatedCost: number;
  plantError: string;
}

/**
 * Что уйдёт со склада. Показываем ДО посадки: раньше сырьё не списывалось
 * вообще, и нехватка семян выяснялась уже в теплице.
 */
export function PlantingRequirements({ requirements, estimatedCost, plantError }: RequirementsProps) {
  return (
    <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-tertiary)' }}>
      {plantError ? (
        <div style={{ color: 'var(--warning)', fontSize: 'var(--text-sm)' }}>⚠️ {plantError}</div>
      ) : (
        <>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
            Спишется со склада сырья
          </div>
          {requirements.map((need) => (
            <div key={need.kind} style={{ fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {need.label}: {need.required.toLocaleString('ru-RU')} {need.material?.unit ?? ''}
              </span>
              <span style={{ color: need.enough ? 'var(--text-secondary)' : 'var(--error)' }}>
                {need.material
                  ? `есть ${need.material.stock.toLocaleString('ru-RU')} ${need.material.unit}`
                  : 'нет на складе'}
              </span>
            </div>
          ))}
          {estimatedCost > 0 && (
            <div style={{ marginTop: 6, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
              Себестоимость партии ≈ {Math.round(estimatedCost).toLocaleString('ru-RU')} сум
            </div>
          )}
        </>
      )}
    </div>
  );
}
