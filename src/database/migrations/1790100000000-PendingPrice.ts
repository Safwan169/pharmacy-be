import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A selling price that takes effect once the stock received before a given
 * batch has sold out — "old packs at the old price, new packs at the new".
 */
export class PendingPrice1790100000000 implements MigrationInterface {
  name = 'PendingPrice1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "variant_pending_prices" (
        "id" SERIAL PRIMARY KEY,
        "variant_id" integer NOT NULL UNIQUE
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        "after_batch_id" integer NOT NULL
          REFERENCES "stock_batches"("id") ON DELETE CASCADE,
        "unit_prices" jsonb NOT NULL,
        "created_by_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "variant_pending_prices"`);
  }
}
