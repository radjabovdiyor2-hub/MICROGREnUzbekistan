'use client';

import { useState } from 'react';
import { useSuppliers } from './useAdminReferences';
import { BULK_KINDS, type RawMaterial } from './rawMaterialTypes';
import { NewRawMaterialFields, RawMaterialReceiptFields } from './AdminRawMaterialFields';

// Форма выполняет две задачи: завести позицию сырья и оприходовать приход.
// `material` задан → приход по нему; `null` → заведение новой позиции.
// Сами поля живут в AdminRawMaterialFields — здесь состояние и отправка.

interface Props {
  material: RawMaterial | null;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}

export function AdminRawMaterialForm({ material, saving, error, onCancel, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RawMaterial['kind']>('SEED');
  const [unit, setUnit] = useState('g');
  const [minStock, setMinStock] = useState('');
  const [cropType, setCropType] = useState('');

  const [quantity, setQuantity] = useState('');
  // Подставляем последнюю цену этого поставщика: чаще всего она и есть
  // актуальная, а если рынок изменился — владелец правит, и прайс обновится.
  // Начальное значение, а не setState в эффекте: форма пересоздаётся при смене
  // позиции, и лишний каскад рендеров тут не нужен.
  const [unitCost, setUnitCost] = useState(
    material?.lastPrice ? String(material.lastPrice.price) : '',
  );
  const [supplierId, setSupplierId] = useState(material?.lastPrice?.supplierId ?? '');
  const [onCredit, setOnCredit] = useState(false);
  // Единица ВВОДА прихода. Хранение всегда в граммах; килограммы переводим.
  const [intakeUnit, setIntakeUnit] = useState<'g' | 'kg'>('kg');
  const suppliers = useSuppliers();

  // Килограммы → граммы: и количество, и цена. Цена за килограмм делится
  // на 1000, иначе средневзвешенная себестоимость вырастет в тысячу раз.
  const factor = material?.unit === 'g' && intakeUnit === 'kg' ? 1000 : 1;
  const intakeUnitLabel = factor === 1000 ? 'кг' : (material?.unit ?? '');
  const storedQuantity = Number(quantity) * factor;
  const storedUnitCost = Number(unitCost) / factor;

  const submitReceipt = () => {
    onSubmit({
      action: 'receipt',
      materialId: material!.id,
      quantity: storedQuantity,
      unitCost: storedUnitCost,
      supplierId: supplierId || null,
      onCredit,
    });
  };

  const submitNew = () => {
    onSubmit({ name, kind, unit: BULK_KINDS.includes(kind) ? 'g' : unit, minStock: Number(minStock) || 0, cropType: cropType || null });
  };

  const priceChanged =
    material?.lastPrice != null && Number(unitCost) !== material.lastPrice.price;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        {material ? `Приход: ${material.name}` : 'Новая позиция сырья'}
      </h3>

      {material ? (
        <RawMaterialReceiptFields
          material={material}
          suppliers={suppliers}
          quantity={quantity}
          setQuantity={setQuantity}
          unitCost={unitCost}
          setUnitCost={setUnitCost}
          supplierId={supplierId}
          setSupplierId={setSupplierId}
          onCredit={onCredit}
          setOnCredit={setOnCredit}
          intakeUnit={intakeUnit}
          setIntakeUnit={setIntakeUnit}
          intakeUnitLabel={intakeUnitLabel}
        />
      ) : (
        <NewRawMaterialFields
          name={name}
          setName={setName}
          kind={kind}
          setKind={setKind}
          unit={unit}
          setUnit={setUnit}
          minStock={minStock}
          setMinStock={setMinStock}
          cropType={cropType}
          setCropType={setCropType}
        />
      )}

      {material && (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Сейчас на складе {material.stock} {material.unit} по {Math.round(material.avgCost)} сум.
          {factor === 1000 && quantity && (
            <> Придёт {storedQuantity.toLocaleString('ru-RU')} г по {storedUnitCost.toFixed(2)} сум/г.</>
          )}
          {quantity && unitCost && (
            <> После прихода средняя станет{' '}
              {Math.round(
                (material.stock * material.avgCost + storedQuantity * storedUnitCost) /
                  (material.stock + storedQuantity || 1),
              )}{' '}
              сум — приход усредняется с остатком.
            </>
          )}
          {priceChanged && <> Цена поставщика изменилась — прайс обновится.</>}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <button className="btn btn-primary" disabled={saving} onClick={material ? submitReceipt : submitNew}>
          {saving ? 'Сохраняю…' : material ? 'Оприходовать' : 'Завести'}
        </button>
        <button className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
