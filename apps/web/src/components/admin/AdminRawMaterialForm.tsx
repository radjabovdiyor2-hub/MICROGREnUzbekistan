'use client';

import { useState } from 'react';

import { sumLabel, unitLabel } from '@/lib/units';
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
  /**
   * Позиция, которую ПРАВЯТ.
   *
   * До этого заведённую позицию изменить было нечем: экран знал только
   * «завести новую» и «приход». Из-за этого узбекское имя у уже заведённых
   * тридцати двух позиций заполнить было негде — колонка осталась бы пустой
   * навсегда.
   */
  editing?: RawMaterial | null;
  lang: 'ru' | 'uz';
}

const T = {
  newItem: { ru: 'Новая позиция сырья', uz: 'Yangi xomashyo pozitsiyasi' },
  receiptOf: { ru: 'Приход', uz: 'Kirim' },
  nowInStock: { ru: 'Сейчас на складе', uz: 'Hozir omborda' },
  at: { ru: 'по', uz: 'narxi' },
  willCome: { ru: 'Придёт', uz: 'Keladi' },
  afterAvg: { ru: 'После прихода средняя станет', uz: "Kirimdan keyin o'rtacha bo'ladi" },
  averaged: { ru: 'приход усредняется с остатком', uz: "kirim qoldiq bilan o'rtachalanadi" },
  priceChanged: {
    ru: 'Цена поставщика изменилась — прайс обновится.',
    uz: "Yetkazib beruvchi narxi o'zgardi — narxlar yangilanadi.",
  },
  saving: { ru: 'Сохраняю…', uz: 'Saqlanmoqda…' },
  receive: { ru: 'Оприходовать', uz: 'Kirim qilish' },
  create: { ru: 'Завести', uz: 'Kiritish' },
  cancel: { ru: 'Отмена', uz: 'Bekor qilish' },
  editOf: { ru: 'Правка', uz: 'Tahrirlash' },
  save: { ru: 'Сохранить', uz: 'Saqlash' },
};

export function AdminRawMaterialForm({ material, saving, error, onCancel, onSubmit, editing, lang }: Props) {
  const t = (k: keyof typeof T) => T[k][lang];
  // Начальные значения, а не эффект: форма пересоздаётся по `key` при смене
  // позиции, и подстановка здесь — это подстановка один раз.
  const [name, setName] = useState(editing?.name ?? '');
  const [nameUz, setNameUz] = useState(editing?.nameUz ?? '');
  const [kind, setKind] = useState<RawMaterial['kind']>(editing?.kind ?? 'SEED');
  const [unit, setUnit] = useState(editing?.unit ?? 'g');
  const [minStock, setMinStock] = useState(editing ? String(editing.minStock) : '');
  const [cropType, setCropType] = useState(editing?.cropType ?? '');

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
  const intakeUnitLabel = factor === 1000 ? unitLabel('кг', lang) : unitLabel(material?.unit ?? '', lang);
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
    const fields = {
      name, nameUz: nameUz.trim() || null, kind,
      unit: BULK_KINDS.includes(kind) ? 'g' : unit,
      minStock: Number(minStock) || 0,
      cropType: cropType || null,
    };
    onSubmit(editing ? { action: 'update', id: editing.id, ...fields } : fields);
  };

  const priceChanged =
    material?.lastPrice != null && Number(unitCost) !== material.lastPrice.price;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        {editing ? `${t('editOf')}: ${editing.name}` : material ? `${t('receiptOf')}: ${material.name}` : t('newItem')}
      </h3>

      {material && !editing ? (
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
          lang={lang}
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
          nameUz={nameUz}
          setNameUz={setNameUz}
          lang={lang}
        />
      )}

      {material && !editing && (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {t('nowInStock')} {material.stock} {unitLabel(material.unit, lang)} {t('at')} {Math.round(material.avgCost)} {sumLabel(lang)}.
          {factor === 1000 && quantity && (
            <> {t('willCome')} {storedQuantity.toLocaleString('ru-RU')} {unitLabel('г', lang)} {t('at')} {storedUnitCost.toFixed(2)} {sumLabel(lang)}/{unitLabel('г', lang)}.</>
          )}
          {quantity && unitCost && (
            <> {t('afterAvg')}{' '}
              {Math.round(
                (material.stock * material.avgCost + storedQuantity * storedUnitCost) /
                  (material.stock + storedQuantity || 1),
              )}{' '}
              {sumLabel(lang)} — {t('averaged')}.
            </>
          )}
          {priceChanged && <> {t('priceChanged')}</>}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <button className="btn btn-primary" disabled={saving} onClick={material && !editing ? submitReceipt : submitNew}>
          {saving ? t('saving') : editing ? t('save') : material ? t('receive') : t('create')}
        </button>
        <button className="btn" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}
