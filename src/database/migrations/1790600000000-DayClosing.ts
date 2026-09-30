import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the drawer actually held when the shop shut.
 *
 * The expected figure was built by adding up every taking and payout since the
 * shop opened, so money taken out for lunch or a rickshaw — which nobody is
 * going to type in — left a gap that grew for ever. A counted figure ends the
 * day's arithmetic: tomorrow starts from what was in the drawer, not from a
 * sum that has been drifting since the first sale.
 *
 * One row per day, so closing again corrects the count rather than adding a
 * second answer.
 */
export class DayClosing1790600000000 implements MigrationInterface {
  name = 'DayClosing1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "day_closings" (
        "id"            SERIAL PRIMARY KEY,
        "business_date" DATE NOT NULL,
        "expected_cash" NUMERIC(12,2) NOT NULL,
        "counted_cash"  NUMERIC(12,2) NOT NULL,
        "difference"    NUMERIC(12,2) NOT NULL,
        "note"          TEXT,
        "closed_by"     INTEGER NOT NULL REFERENCES "users"("id"),
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_day_closings_date" UNIQUE ("business_date")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "day_closings"`);
  }
}
