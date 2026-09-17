import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The counter's three ways to pay — cash, bKash, or "due" (pay later) — plus
 * the customers that due needs, their payments, and a settings table for the
 * shop's identity on receipts.
 */
export class CustomersPaymentsSettings1789658479886 implements MigrationInterface {
  name = 'CustomersPaymentsSettings1789658479886';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "phone" VARCHAR(20),
        "address" VARCHAR(255),
        "due_balance" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_customers_phone" UNIQUE ("phone")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_customers_name" ON "customers" ("name")`);
    await queryRunner.query(
      `CREATE INDEX "idx_customers_due" ON "customers" ("due_balance") WHERE "due_balance" > 0`,
    );

    await queryRunner.query(
      `ALTER TABLE "sales"
         ADD COLUMN "customer_id" INTEGER REFERENCES "customers"("id"),
         ADD COLUMN "amount_tendered" NUMERIC(10,2),
         ADD COLUMN "change_given" NUMERIC(10,2),
         ADD COLUMN "bkash_trx_id" VARCHAR(30),
         ADD COLUMN "paid_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
         ADD COLUMN "due_amount" NUMERIC(10,2) NOT NULL DEFAULT 0,
         ADD CONSTRAINT "chk_sales_payment_method"
           CHECK ("payment_method" IN ('cash', 'bkash', 'due'))`,
    );
    // Everything sold so far was cash and fully paid.
    await queryRunner.query(`UPDATE "sales" SET "paid_amount" = "total_amount"`);
    await queryRunner.query(`CREATE INDEX "idx_sales_customer" ON "sales" ("customer_id")`);

    await queryRunner.query(`
      CREATE TABLE "due_payments" (
        "id" SERIAL PRIMARY KEY,
        "customer_id" INTEGER NOT NULL REFERENCES "customers"("id"),
        "sale_id" INTEGER REFERENCES "sales"("id"),
        "receipt_number" VARCHAR(30) NOT NULL,
        "amount" NUMERIC(10,2) NOT NULL,
        "method" VARCHAR(10) NOT NULL,
        "bkash_trx_id" VARCHAR(30),
        "note" VARCHAR(255),
        "balance_after" NUMERIC(12,2) NOT NULL,
        "created_by" INTEGER NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_due_payments_number" UNIQUE ("receipt_number"),
        CONSTRAINT "chk_due_payments_method" CHECK ("method" IN ('cash', 'bkash')),
        CONSTRAINT "chk_due_payments_amount" CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_due_payments_customer" ON "due_payments" ("customer_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_due_payments_created" ON "due_payments" ("created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "settings" (
        "key" VARCHAR(50) PRIMARY KEY,
        "value" TEXT NOT NULL DEFAULT '',
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO "settings" ("key", "value") VALUES
        ('shop_name', 'Pharmacy'),
        ('shop_address', ''),
        ('shop_phone', ''),
        ('drug_license_no', ''),
        ('receipt_footer', 'Thank you. Medicines cannot be returned after 7 days.'),
        ('low_stock_threshold', ''),
        ('receipt_width_mm', '80')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "due_payments"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_customer"`);
    await queryRunner.query(
      `ALTER TABLE "sales"
         DROP CONSTRAINT "chk_sales_payment_method",
         DROP COLUMN "due_amount",
         DROP COLUMN "paid_amount",
         DROP COLUMN "bkash_trx_id",
         DROP COLUMN "change_given",
         DROP COLUMN "amount_tendered",
         DROP COLUMN "customer_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
