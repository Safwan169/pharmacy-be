import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Per-day counter behind the `INV-YYYYMMDD-NNNN` invoice numbers.
 *
 * Incremented with a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`,
 * which takes a row lock, so concurrent checkouts serialise on it and can never
 * be handed the same sequence value. Counting today's sales instead would race.
 */
@Entity({ name: 'invoice_sequences' })
export class InvoiceSequence {
  @PrimaryColumn({ type: 'date' })
  day!: string;

  @Column({ name: 'last_value', type: 'integer', default: 0 })
  lastValue!: number;
}
