'use client';

import { useState, useEffect } from 'react';
import { Eye, AlertTriangle, CheckCircle, Image as ImageIcon } from 'lucide-react';

interface QualityControl {
  id: string;
  batchId: string;
  inspectorId: string | null;
  status: string; // 'passed' | 'failed'
  defectType: string | null;
  notes: string | null;
  photoUrl: string | null;
  createdAt: string;
  batch?: {
    batchNumber: string;
    product: { nameRu: string };
  };
  inspector?: {
    name: string;
  };
}

export function AdminQA() {
  const [qcs, setQcs] = useState<QualityControl[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/qa')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setQcs(data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Загрузка отчетов QA...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Eye size={24} /> Контроль Качества (QA)
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {qcs.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Отчетов контроля качества нет
          </div>
        ) : (
          qcs.map(qc => (
            <div key={qc.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontWeight: 'bold' }}>
                    Партия: {qc.batch?.batchNumber || qc.batchId}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {new Date(qc.createdAt).toLocaleString('ru-RU')}
                    {qc.inspector?.name && ` • Инспектор: ${qc.inspector.name}`}
                  </div>
                </div>
                <div>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px',
                    background: qc.status === 'passed' ? 'var(--success-bg)' : 'var(--error-bg)',
                    color: qc.status === 'passed' ? 'var(--success)' : 'var(--error)'
                  }}>
                    {qc.status === 'passed' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                    {qc.status === 'passed' ? 'Пройдено' : 'Брак'}
                  </span>
                </div>
              </div>

              {(qc.defectType || qc.notes) && (
                <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: 'var(--space-2)' }}>
                  {qc.defectType && <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Тип брака: {qc.defectType}</div>}
                  {qc.notes && <div>{qc.notes}</div>}
                </div>
              )}

              {qc.photoUrl && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <a href={qc.photoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--brand-primary)', background: 'var(--brand-primary-light)', padding: '4px 8px', borderRadius: '4px' }}>
                    <ImageIcon size={14} /> Посмотреть фото
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
