import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Checkout / sales / invoicing.
 *
 * `invoice_sequences` is not in the original spec but is required by the chosen
 * `INV-YYYYMMDD-NNNN` numbering: it gives each day an atomically incremented
 * counter. Deriving the number from a COUNT of the day's sales would race
 * between concurrent checkouts and produce duplicate invoice numbers.
 */
export class SalesAndInvoices1786943593963 implements MigrationInterface {
  name = 'SalesAndInvoices1786943593963';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id"              SERIAL PRIMARY KEY,
        "invoice_number"  VARCHAR(50) NOT NULL,
        "subtotal"        NUMERIC(10,2) NOT NULL,
        "discount_type"   VARCHAR(10),
        "discount_value"  NUMERIC(10,2),
        "discount_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
        "total_amount"    NUMERIC(10,2) NOT NULL,
        "payment_method"  VARCHAR(20) NOT NULL DEFAULT 'cash',
        "created_by"      INTEGER NOT NULL REFERENCES "users"("id"),
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_sales_invoice_number" UNIQUE ("invoice_number"),
        CONSTRAINT "chk_sales_discount_type"
          CHECK ("discount_type" IN ('flat', 'percentage'))
      )
    `);
    // Supports the date-range filter on the sales list.
    await queryRunner.query(
      `CREATE INDEX "idx_sales_created_at" ON "sales" ("created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "sale_items" (
        "id"                    SERIAL PRIMARY KEY,
        "sale_id"               INTEGER NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
        "product_variant_id"    INTEGER NOT NULL REFERENCES "product_variants"("id"),
        "brand_name_snapshot"   VARCHAR(255) NOT NULL,
        "dosage_form_snapshot"  VARCHAR(100) NOT NULL,
        "strength_snapshot"     VARCHAR(100),
        "unit_price"            NUMERIC(10,2) NOT NULL,
        "quantity"              INTEGER NOT NULL,
        "line_total"            NUMERIC(10,2) NOT NULL,
        CONSTRAINT "chk_sale_items_quantity" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sale_items_sale" ON "sale_items" ("sale_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_items_variant" ON "sale_items" ("product_variant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invoice_sequences" (
        "day"        DATE PRIMARY KEY,
        "last_value" INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_sequences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales"`);
  }
}
