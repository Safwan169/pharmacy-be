import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock-in: suppliers and goods-received notes.
 *
 * A receipt is how batches get created with a batch number, expiry date and
 * cost — the pricing screen's stock field remains for count corrections only.
 * `document_sequences` is a general per-prefix, per-day counter for
 * GRN-/RET-/PAY- numbers; invoices keep their own table untouched.
 */
export class StockReceipts1789656475640 implements MigrationInterface {
  name = 'StockReceipts1789656475640';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "document_sequences" (
        "prefix"     VARCHAR(10) NOT NULL,
        "day"        DATE NOT NULL,
        "last_value" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "pk_document_sequences" PRIMARY KEY ("prefix", "day")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(150) NOT NULL,
        "phone" VARCHAR(30),
        "address" VARCHAR(255),
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_suppliers_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_receipts" (
        "id" SERIAL PRIMARY KEY,
        "receipt_number" VARCHAR(30) NOT NULL,
        "supplier_id" INTEGER REFERENCES "suppliers"("id"),
        "supplier_invoice_no" VARCHAR(50),
        "received_at" DATE NOT NULL DEFAULT CURRENT_DATE,
        "total_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "note" VARCHAR(255),
        "created_by" INTEGER NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_stock_receipts_number" UNIQUE ("receipt_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stock_receipts_received_at" ON "stock_receipts" ("received_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stock_receipts_supplier" ON "stock_receipts" ("supplier_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "stock_receipt_items" (
        "id" SERIAL PRIMARY KEY,
        "receipt_id" INTEGER NOT NULL
          REFERENCES "stock_receipts"("id") ON DELETE CASCADE,
        "variant_id" INTEGER NOT NULL REFERENCES "product_variants"("id"),
        "batch_id" INTEGER NOT NULL REFERENCES "stock_batches"("id"),
        "batch_no" VARCHAR(50),
        "expiry_date" DATE,
        "unit_name" VARCHAR(30) NOT NULL,
        "qty_in_base" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL,
        "base_quantity" INTEGER NOT NULL,
        "unit_cost" NUMERIC(10,2) NOT NULL,
        "line_cost" NUMERIC(12,2) NOT NULL,
        CONSTRAINT "chk_stock_receipt_items_quantity" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stock_receipt_items_receipt" ON "stock_receipt_items" ("receipt_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stock_receipt_items_variant" ON "stock_receipt_items" ("variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipt_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_sequences"`);
  }
}
