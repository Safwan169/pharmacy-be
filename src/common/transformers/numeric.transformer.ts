import { ValueTransformer } from 'typeorm';

/**
 * `pg` returns NUMERIC columns as strings to avoid float precision loss, which
 * would surface in JSON responses as `"12.50"` instead of `12.5`. NUMERIC(10,2)
 * fits comfortably in a JS double, so converting on read is safe here.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
