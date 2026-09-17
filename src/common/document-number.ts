import { EntityManager } from 'typeorm';

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
 */
export async function nextDocumentNumber(
  manager: EntityManager,
  prefix: string,
): Promise<string> {
  const rows: SequenceRow[] = await manager.query(
    `INSERT INTO document_sequences ("prefix", "day", "last_value")
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT ("prefix", "day") DO UPDATE
       SET "last_value" = document_sequences."last_value" + 1
     RETURNING to_char("day", 'YYYYMMDD') AS day_key, "last_value"`,
    [prefix],
  );
  const row = rows[0];
  return `${prefix}-${row.day_key}-${String(Number(row.last_value)).padStart(4, '0')}`;
}
