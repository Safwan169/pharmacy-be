import { EntityManager } from 'typeorm';
import { PHARMACY_TIME_ZONE } from '../modules/dashboard/date-range';

interface SequenceRow {
  day_key: string;
  last_value: number | string;
}

/**
 * `GRN-20260917-0003`, `RET-…`, `PAY-…` — a per-prefix, per-day counter.
 *
 * One `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` takes the row lock, so
 * two receipts saved at the same moment can never share a number. Same
 * pattern as invoice numbers, which keep their own table for compatibility.
 *
 * The day is the shop's own, not the server's. `CURRENT_DATE` is the database
 * session's timezone, which is UTC in every deployment of this — so a delivery
 * taken in at one in the morning was numbered with yesterday's date while
 * every screen and report placed it today.
 */
export async function nextDocumentNumber(
  manager: EntityManager,
  prefix: string,
): Promise<string> {
  const rows: SequenceRow[] = await manager.query(
    `INSERT INTO document_sequences ("prefix", "day", "last_value")
     VALUES ($1, (now() AT TIME ZONE $2)::date, 1)
     ON CONFLICT ("prefix", "day") DO UPDATE
       SET "last_value" = document_sequences."last_value" + 1
     RETURNING to_char("day", 'YYYYMMDD') AS day_key, "last_value"`,
    [prefix, PHARMACY_TIME_ZONE],
  );
  const row = rows[0];
  return `${prefix}-${row.day_key}-${String(Number(row.last_value)).padStart(4, '0')}`;
}
