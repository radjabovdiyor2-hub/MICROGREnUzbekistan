'use client';

import { useState } from 'react';
import type { CropNorm, SubstrateOption } from './growingData';
import { plantingUnitWord } from './growingData';

// Форма нормы культуры. Вынесена из AdminCropNorms, чтобы оба файла
// оставались в пределах 200 строк.
//
// Два способа выращивания: микрозелень в ЛОТКАХ на кокосе (граммы на лоток),
// салаты ПОШТУЧНО в стаканчиках 63 мм на агро вате (штуки семян и одна пробка
// на стаканчик). Поэтому подписи полей зависят от выбранного способа, а не
// говорят «на лоток» всегда.

interface Props {
  norm: CropNorm | null;
  substrates: SubstrateOption[];
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

export function AdminCropNormForm({ norm, substrates, saving, error, onCancel, onSubmit }: Props) {
  const [cropType, setCropType] = useState(norm?.cropType ?? '');
  const [nameRu, setNameRu] = useState(norm?.nameRu ?? '');
  const [plantingUnit, setPlantingUnit] = useState<'tray' | 'cup'>(norm?.plantingUnit ?? 'tray');
  const [seedUnit, setSeedUnit] = useState<'g' | 'pcs'>(norm?.seedUnit ?? 'g');
  const [seedPerUnit, setSeedPerUnit] = useState(String(norm?.seedPerUnit ?? ''));
  const [substrate, setSubstrate] = useState(String(norm?.substratePerUnit ?? ''));
  const [substrateId, setSubstrateId] = useState(norm?.substrateMaterialId ?? '');
  const [traysPerBatch, setTraysPerBatch] = useState(String(norm?.traysPerBatch ?? 1));
  const [packaging, setPackaging] = useState(String(norm?.packagingPerUnit ?? ''));
  const [yieldPerUnit, setYieldPerUnit] = useState(String(norm?.yieldPerUnit ?? ''));
  const [darkDays, setDarkDays] = useState(String(norm?.darkDays ?? 3));
  const [lightDays, setLightDays] = useState(String(norm?.lightDays ?? 6));
  const [shelfDays, setShelfDays] = useState(String(norm?.shelfDays ?? 5));

  const unit = plantingUnitWord(plantingUnit);
  const seedUnitWord = seedUnit === 'pcs' ? 'шт' : 'г';

  const pickUnit = (next: 'tray' | 'cup') => {
    setPlantingUnit(next);
    // Разумные умолчания под способ: стаканчики лотков не расходуют и сеются
    // поштучно. Без нуля посадка 250 стаканчиков списала бы 250 лотков.
    if (next === 'cup') {
      setSeedUnit('pcs');
      setTraysPerBatch('0');
    } else {
      setSeedUnit('g');
      setTraysPerBatch('1');
    }
  };

  const submit = () => {
    onSubmit({
      cropType: cropType.trim().toLowerCase(),
      nameRu: nameRu.trim() || cropType.trim(),
      plantingUnit,
      seedUnit,
      seedPerUnit: Number(seedPerUnit),
      substratePerUnit: substrate || null,
      substrateMaterialId: substrateId || null,
      traysPerBatch: traysPerBatch === '' ? null : Number(traysPerBatch),
      packagingPerUnit: packaging || null,
      yieldPerUnit: yieldPerUnit || null,
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
          <label style={label} htmlFor="norm-unit">Способ посадки</label>
          <select id="norm-unit" style={input} value={plantingUnit}
            onChange={(e) => pickUnit(e.target.value as 'tray' | 'cup')}>
            <option value="tray">Лотки (микрозелень)</option>
            <option value="cup">Стаканчики 63 мм (салаты)</option>
          </select>
        </div>
        <div>
          <label style={label} htmlFor="norm-seed-unit">Семена считаем</label>
          <select id="norm-seed-unit" style={input} value={seedUnit}
            onChange={(e) => setSeedUnit(e.target.value as 'g' | 'pcs')}>
            <option value="g">в граммах</option>
            <option value="pcs">в штуках</option>
          </select>
        </div>
        <div>
          <label style={label} htmlFor="norm-seed">Семян на {unit}, {seedUnitWord} *</label>
          <input id="norm-seed" style={input} type="number" value={seedPerUnit}
            onChange={(e) => setSeedPerUnit(e.target.value)} placeholder="120" />
        </div>
        <div>
          <label style={label} htmlFor="norm-yield">Выход с {unit === 'лоток' ? 'лотка' : 'стаканчика'}, г</label>
          <input id="norm-yield" style={input} type="number" value={yieldPerUnit}
            onChange={(e) => setYieldPerUnit(e.target.value)} placeholder="500" />
        </div>
        <div>
          <label style={label} htmlFor="norm-substrate-id">Какой субстрат</label>
          <select id="norm-substrate-id" style={input} value={substrateId}
            onChange={(e) => setSubstrateId(e.target.value)}>
            <option value="">— не выбран —</option>
            {substrates.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="norm-substrate">Субстрата на {unit}</label>
          <input id="norm-substrate" style={input} type="number" value={substrate}
            onChange={(e) => setSubstrate(e.target.value)}
            placeholder={plantingUnit === 'cup' ? '1' : '150'} />
        </div>
        <div>
          <label style={label} htmlFor="norm-trays">Лотков на {unit}</label>
          <input id="norm-trays" style={input} type="number" value={traysPerBatch}
            onChange={(e) => setTraysPerBatch(e.target.value)} placeholder="1" />
        </div>
        <div>
          <label style={label} htmlFor="norm-pack">Упаковка на {unit}, шт</label>
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
        и посчитает себестоимость партии. Субстрат выбирайте явно: кокос и агро
        вата не взаимозаменяемы, и без выбора посадка списала бы первый попавшийся.
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
