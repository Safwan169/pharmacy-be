import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the shop owes its suppliers: each delivery records how much was paid
 * at the time, later payments settle the oldest open deliveries first, and
 * suppliers carry a denormalised due balance the way customers do.
 */
export class SupplierDues1789986235152 implements MigrationInterface {
  name = 'SupplierDues1789986235152';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD "paid_amount" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD CONSTRAINT "chk_stock_receipts_paid" CHECK ("paid_amount" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD "due_balance" numeric(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`
      CREATE TABLE "supplier_payments" (
        "id" SERIAL NOT NULL,
        "supplier_id" integer,
        "receipt_id" integer,
        "payment_number" character varying(30) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "method" character varying(10) NOT NULL,
        "reference" character varying(50),
        "note" character varying(255),
        "balance_after" numeric(12,2) NOT NULL,
        "created_by" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_supplier_payments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_supplier_payments_number" UNIQUE ("payment_number"),
        CONSTRAINT "chk_supplier_payments_method" CHECK ("method" IN ('cash', 'bkash')),
        CONSTRAINT "chk_supplier_payments_amount" CHECK ("amount" > 0),
        CONSTRAINT "fk_supplier_payments_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id"),
        CONSTRAINT "fk_supplier_payments_receipt" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id"),
        CONSTRAINT "fk_supplier_payments_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_supplier_payments_supplier" ON "supplier_payments" ("supplier_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_supplier_payments_created" ON "supplier_payments" ("created_at")`,
    );
    // Deliveries recorded before this feature had no payment field; treat them
    // as settled so nobody wakes up owing every distributor their whole history.
    await queryRunner.query(`UPDATE "stock_receipts" SET "paid_amount" = "total_cost"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "supplier_payments"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "due_balance"`);
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" DROP CONSTRAINT "chk_stock_receipts_paid"`,
    );
    await queryRunner.query(`ALTER TABLE "stock_receipts" DROP COLUMN "paid_amount"`);
  }
}
