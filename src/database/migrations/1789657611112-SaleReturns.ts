import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Voiding a sale and taking items back.
 *
 * A void reverses the whole sale the same day it was made; a return takes
 * back some lines later, refunding pro rata and restocking into the batch
 * the stock came from. Both leave the original sale row in place — only its
 * `status` moves — so the invoice history stays complete.
 */
export class SaleReturns1789657611112 implements MigrationInterface {
  name = 'SaleReturns1789657611112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales"
         ADD COLUMN "status" VARCHAR(15) NOT NULL DEFAULT 'completed',
         ADD COLUMN "voided_at" TIMESTAMPTZ,
         ADD COLUMN "voided_by" INTEGER REFERENCES "users"("id"),
         ADD COLUMN "void_reason" VARCHAR(255),
         ADD CONSTRAINT "chk_sales_status" CHECK (
           "status" IN ('completed', 'voided', 'returned', 'partial_return')
         )`,
    );
    await queryRunner.query(`CREATE INDEX "idx_sales_status" ON "sales" ("status")`);

    await queryRunner.query(
      `ALTER TABLE "sale_items"
         ADD COLUMN "returned_quantity" INTEGER NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(`
      CREATE TABLE "sale_returns" (
        "id" SERIAL PRIMARY KEY,
        "sale_id" INTEGER NOT NULL REFERENCES "sales"("id"),
        "return_number" VARCHAR(30) NOT NULL,
        "refund_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
        "refund_method" VARCHAR(10) NOT NULL,
        "reason" VARCHAR(255),
        "created_by" INTEGER NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_sale_returns_number" UNIQUE ("return_number"),
        CONSTRAINT "chk_sale_returns_method" CHECK (
          "refund_method" IN ('cash', 'bkash', 'due_adjust')
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sale_returns_sale" ON "sale_returns" ("sale_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_returns_created" ON "sale_returns" ("created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "sale_return_items" (
        "id" SERIAL PRIMARY KEY,
        "return_id" INTEGER NOT NULL
          REFERENCES "sale_returns"("id") ON DELETE CASCADE,
        "sale_item_id" INTEGER NOT NULL REFERENCES "sale_items"("id"),
        "quantity" INTEGER NOT NULL,
        "base_quantity" INTEGER NOT NULL,
        "refund_amount" NUMERIC(10,2) NOT NULL,
        "restock" BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT "chk_sale_return_items_quantity" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sale_return_items_return" ON "sale_return_items" ("return_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_return_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_returns"`);
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN "returned_quantity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_status"`);
    await queryRunner.query(
      `ALTER TABLE "sales"
         DROP CONSTRAINT "chk_sales_status",
         DROP COLUMN "void_reason",
         DROP COLUMN "voided_by",
         DROP COLUMN "voided_at",
         DROP COLUMN "status"`,
    );
  }
}
