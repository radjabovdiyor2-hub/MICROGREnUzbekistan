'use client';

import { useEffect, useState } from 'react';
import type { Batch } from './growingData';

// Форма записи проверки качества.
//
// Раздел был только для чтения: API умеет создавать проверки, а в компоненте
// не было ни одного POST. Экран показывал пустой список, и выглядело это как
// «функции нет» — при полностью готовом бэкенде.

interface Props {
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}

const field: React.CSSProperties = {
  width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
  color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
};

const label: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, display: 'block',
};

/** Типы брака — список, а не свободный ввод: иначе отчёт по браку не собрать. */
const DEFECTS = [
  { value: 'mold', label: 'Плесень' },
  { value: 'uneven', label: 'Неравномерный рост' },
  { value: 'yellowing', label: 'Пожелтение' },
  { value: 'pest', label: 'Вредители' },
  { value: 'overgrown', label: 'Перерос' },
  { value: 'other', label: 'Другое' },
];

export function AdminQAForm({ saving, error, onCancel, onSubmit }: Props) {
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState('passed');
  const [defectType, setDefectType] = useState('');
  const [notes, setNotes] = useState('');
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    // Партию выбирают из живых посадок, а не вводят id руками.
    fetch('/api/admin/grow-batches', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => setBatches(d.status === 'ok' ? d.batches : []))
      .catch(() => {});
  }, []);

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        Новая проверка
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
        <div>
          <label style={label} htmlFor="qa-batch">Партия *</label>
          <select id="qa-batch" style={field} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">— выберите —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.cropType}, {b.trays} лотк., посев {b.seedDate}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label} htmlFor="qa-status">Результат</label>
          <select id="qa-status" style={field} value={status}
            onChange={(e) => { setStatus(e.target.value); if (e.target.value === 'passed') setDefectType(''); }}>
            <option value="passed">Годно</option>
            <option value="failed">Брак</option>
          </select>
        </div>

        {status === 'failed' && (
          <div>
            <label style={label} htmlFor="qa-defect">Тип брака</label>
            <select id="qa-defect" style={field} value={defectType} onChange={(e) => setDefectType(e.target.value)}>
              <option value="">— не указан —</option>
              {DEFECTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label} htmlFor="qa-notes">Заметка</label>
          <input id="qa-notes" style={field} value={notes}
            onChange={(e) => setNotes(e.target.value)} placeholder="Что увидели" />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving || !batchId}
          onClick={() => onSubmit({ batchId, status, defectType: defectType || null, notes: notes || null })}>
          {saving ? 'Сохраняю…' : 'Записать'}
        </button>
        <button className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
