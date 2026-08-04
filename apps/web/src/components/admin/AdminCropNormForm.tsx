'use client';

import { useState } from 'react';
import type { CropNorm } from './growingData';

// Форма нормы культуры. Вынесена из AdminCropNorms, чтобы оба файла
// оставались в пределах 200 строк.

interface Props {
  norm: CropNorm | null;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}

const input: React.CSSProperties = {
  width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
  color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
};

const label: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, display: 'block',
};

export function AdminCropNormForm({ norm, saving, error, onCancel, onSubmit }: Props) {
  const [cropType, setCropType] = useState(norm?.cropType ?? '');
  const [nameRu, setNameRu] = useState(norm?.nameRu ?? '');
  const [seedGrams, setSeedGrams] = useState(String(norm?.seedGramsPerTray ?? ''));
  const [substrate, setSubstrate] = useState(String(norm?.substrateGramsPerTray ?? ''));
  const [packaging, setPackaging] = useState(String(norm?.packagingPerTray ?? ''));
  const [yieldPerTray, setYieldPerTray] = useState(String(norm?.yieldPerTray ?? ''));
  const [darkDays, setDarkDays] = useState(String(norm?.darkDays ?? 3));
  const [lightDays, setLightDays] = useState(String(norm?.lightDays ?? 6));
  const [shelfDays, setShelfDays] = useState(String(norm?.shelfDays ?? 5));

  const submit = () => {
    onSubmit({
      cropType: cropType.trim().toLowerCase(),
      nameRu: nameRu.trim() || cropType.trim(),
      seedGramsPerTray: Number(seedGrams),
      substrateGramsPerTray: substrate || null,
      packagingPerTray: packaging || null,
      yieldPerTray: yieldPerTray || null,
      darkDays: Number(darkDays),
      lightDays: Number(lightDays),
      shelfDays: Number(shelfDays),
    });
  };

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        {norm ? `Норма: ${norm.nameRu}` : 'Новая культура'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
        <div>
          <label style={label} htmlFor="norm-name">Название</label>
          <input id="norm-name" style={input} value={nameRu}
            onChange={(e) => setNameRu(e.target.value)} placeholder="Горошек" />
        </div>
        <div>
          {/* Ключ латиницей: по нему связываются семена на складе, нормы и
              посадка. Менять у существующей культуры нельзя — связь порвётся. */}
          <label style={label} htmlFor="norm-slug">Ключ (латиницей)</label>
          <input id="norm-slug" style={input} value={cropType} disabled={!!norm}
            onChange={(e) => setCropType(e.target.value)} placeholder="pea" />
        </div>
        <div>
          <label style={label} htmlFor="norm-seed">Семян на лоток, г *</label>
          <input id="norm-seed" style={input} type="number" value={seedGrams}
            onChange={(e) => setSeedGrams(e.target.value)} placeholder="120" />
        </div>
        <div>
          <label style={label} htmlFor="norm-yield">Выход с лотка, г</label>
          <input id="norm-yield" style={input} type="number" value={yieldPerTray}
            onChange={(e) => setYieldPerTray(e.target.value)} placeholder="500" />
        </div>
        <div>
          <label style={label} htmlFor="norm-substrate">Субстрат на лоток, г</label>
          <input id="norm-substrate" style={input} type="number" value={substrate}
            onChange={(e) => setSubstrate(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={label} htmlFor="norm-pack">Упаковка на лоток, шт</label>
          <input id="norm-pack" style={input} type="number" value={packaging}
            onChange={(e) => setPackaging(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={label} htmlFor="norm-dark">Тёмная фаза, дн</label>
          <input id="norm-dark" style={input} type="number" value={darkDays}
            onChange={(e) => setDarkDays(e.target.value)} />
        </div>
        <div>
          <label style={label} htmlFor="norm-light">На свету, дн</label>
          <input id="norm-light" style={input} type="number" value={lightDays}
            onChange={(e) => setLightDays(e.target.value)} />
        </div>
        <div>
          <label style={label} htmlFor="norm-shelf">Хранение, дн</label>
          <input id="norm-shelf" style={input} type="number" value={shelfDays}
            onChange={(e) => setShelfDays(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Расход семян — главное число: по нему посадка спишет сырьё со склада
        и посчитает себестоимость партии. Уточните его по своим семенам.
      </div>

      {error && (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
