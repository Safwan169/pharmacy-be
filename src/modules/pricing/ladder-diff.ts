import { VariantUnit } from '../product-variants/entities/variant-unit.entity';

export function unitSnapshot(u: VariantUnit) {
  return { name: u.name, qty_in_base: u.qtyInBase, price: u.price, is_sellable: u.isSellable, is_default: u.isDefault };
}

/** "strip 10.00 → 12.00, box added at 110.00" — the readable part of a price change. */
export function describeLadderChange(before: VariantUnit[], after: VariantUnit[]): string[] {
  const fmt = (p: number | null) => (p === null ? '—' : p.toFixed(2));
  const out: string[] = [];
  for (const a of after) {
    const b = before.find((x) => x.name === a.name);
    if (!b) out.push(`${a.name} added at ${fmt(a.price)}`);
    else if (b.price !== a.price) out.push(`${a.name} ${fmt(b.price)} → ${fmt(a.price)}`);
    else if (b.qtyInBase !== a.qtyInBase) out.push(`${a.name} size ${b.qtyInBase} → ${a.qtyInBase}`);
  }
  for (const b of before) {
    if (!after.some((a) => a.name === b.name)) out.push(`${b.name} removed`);
  }
  return out;
}
