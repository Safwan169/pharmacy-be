import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock in batches with expiry dates, and a ledger of every movement.
 *
 * `product_variants.stock_quantity` stays as the fast total but is now always
 * equal to SUM(stock_batches.quantity) for that variant; every write goes
 * through StockService so the two never drift. Checkout deducts from the
 * batch expiring soonest and refuses expired stock.
 *
 * Existing counted stock becomes one "uncounted" batch per variant (no batch
 * number, no expiry) so nothing that sells today stops selling.
 */
export class StockBatches1789655516931 implements MigrationInterface {
  name = 'StockBatches1789655516931';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_batches" (
        "id" SERIAL PRIMARY KEY,
        "variant_id" INTEGER NOT NULL
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        "batch_no" VARCHAR(50),
        "expiry_date" DATE,
        "quantity" INTEGER NOT NULL DEFAULT 0,
        "initial_quantity" INTEGER NOT NULL DEFAULT 0,
        "cost_price" NUMERIC(10,2),
        "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" INTEGER REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_stock_batches_quantity" CHECK ("quantity" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stock_batches_variant_expiry"
         ON "stock_batches" ("variant_id", "expiry_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stock_batches_in_stock"
         ON "stock_batches" ("variant_id") WHERE "quantity" > 0`,
    );

    await queryRunner.query(`
      CREATE TABLE "stock_movements" (
        "id" SERIAL PRIMARY KEY,
        "variant_id" INTEGER NOT NULL
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        "batch_id" INTEGER REFERENCES "stock_batches"("id") ON DELETE SET NULL,
        "type" VARCHAR(20) NOT NULL,
        "quantity" INTEGER NOT NULL,
        "previous_stock" INTEGER NOT NULL,
        "new_stock" INTEGER NOT NULL,
        "reference_type" VARCHAR(20),
        "reference_id" INTEGER,
        "note" VARCHAR(255),
        "created_by" INTEGER REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_stock_movements_type" CHECK (
          "type" IN ('sale', 'sale_return', 'stock_in', 'adjustment', 'expired_writeoff')
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stock_movements_variant_created"
         ON "stock_movements" ("variant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stock_movements_created" ON "stock_movements" ("created_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_items"
         ADD COLUMN "batch_id" INTEGER REFERENCES "stock_batches"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_items_batch" ON "sale_items" ("batch_id")`,
    );

    // Existing counted stock becomes one uncounted batch per variant.
    await queryRunner.query(`
      INSERT INTO "stock_batches" ("variant_id", "quantity", "initial_quantity")
      SELECT "id", "stock_quantity", "stock_quantity"
      FROM "product_variants"
      WHERE "stock_quantity" IS NOT NULL AND "stock_quantity" > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_items_batch"`);
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN "batch_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_batches"`);
  }
}
