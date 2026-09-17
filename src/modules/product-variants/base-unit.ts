/**
 * The base unit is the smallest thing the shop will ever count or sell for a
 * SKU. `product_variants.stock_quantity` is always expressed in it; the
 * sellable units above it (strip, box, pack) are multiples held in
 * `variant_units`.
 */
export const BASE_UNITS = [
  'tablet',
  'capsule',
  'vial',
  'bottle',
  'tube',
  'sachet',
  'piece',
] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const DEFAULT_STRIP_SIZE = 10;
export const DEFAULT_BOX_SIZE = 30;

/** Derives the base unit from the source file's dosage form wording. */
export function baseUnitForDosageForm(dosageForm: string): BaseUnit {
  const form = dosageForm.toLowerCase();
  if (form.includes('tablet')) return 'tablet';
  if (form.includes('capsule')) return 'capsule';
  if (form.includes('injection') || form.includes('infusion')) return 'vial';
  if (form.includes('sachet')) return 'sachet';
  if (
    form.includes('syrup') ||
    form.includes('suspension') ||
    form.includes('solution') ||
    form.includes('drops') ||
    form.includes('emulsion') ||
    form.includes('elixir') ||
    form.includes('mouthwash')
  ) {
    return 'bottle';
  }
  if (
    form.includes('cream') ||
    form.includes('ointment') ||
    form.includes('gel') ||
    form.includes('lotion') ||
    form.includes('paste')
  ) {
    return 'tube';
  }
  if (form.includes('powder')) return 'sachet';
  return 'piece';
}

export interface UnitTemplateRow {
  name: string;
  qty_in_base: number;
  is_sellable: boolean;
  is_default: boolean;
}

/**
 * The suggested ladder for a SKU that hasn't been set up yet. Prices are left
 * for the admin; only the shape is proposed.
 */
export function unitTemplate(
  baseUnit: BaseUnit,
  packSize: number | null,
): UnitTemplateRow[] {
  switch (baseUnit) {
    case 'tablet':
    case 'capsule': {
      const box = packSize && packSize > 1 ? packSize : DEFAULT_BOX_SIZE;
      const strip = box % DEFAULT_STRIP_SIZE === 0 || box > DEFAULT_STRIP_SIZE
        ? DEFAULT_STRIP_SIZE
        : box;
      const rows: UnitTemplateRow[] = [
        { name: baseUnit, qty_in_base: 1, is_sellable: true, is_default: false },
      ];
      if (strip < box) {
        rows.push({ name: 'strip', qty_in_base: strip, is_sellable: true, is_default: true });
        rows.push({ name: 'box', qty_in_base: box, is_sellable: true, is_default: false });
      } else {
        rows.push({ name: 'strip', qty_in_base: box, is_sellable: true, is_default: true });
      }
      return rows;
    }
    case 'vial': {
      const rows: UnitTemplateRow[] = [
        { name: 'vial', qty_in_base: 1, is_sellable: true, is_default: true },
      ];
      if (packSize && packSize > 1) {
        rows.push({ name: 'pack', qty_in_base: packSize, is_sellable: true, is_default: false });
      }
      return rows;
    }
    case 'sachet': {
      const rows: UnitTemplateRow[] = [
        { name: 'sachet', qty_in_base: 1, is_sellable: true, is_default: true },
      ];
      if (packSize && packSize > 1) {
        rows.push({ name: 'box', qty_in_base: packSize, is_sellable: true, is_default: false });
      }
      return rows;
    }
    default:
      return [{ name: baseUnit, qty_in_base: 1, is_sellable: true, is_default: true }];
  }
}
