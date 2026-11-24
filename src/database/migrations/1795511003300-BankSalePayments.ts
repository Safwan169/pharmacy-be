import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankSalePayments1795511003300 implements MigrationInterface {
  name = 'BankSalePayments1795511003300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
        DROP CONSTRAINT "chk_sales_payment_method",
        ADD COLUMN "bank_name" varchar(100),
        ADD CONSTRAINT "chk_sales_payment_method"
          CHECK ("payment_method" IN ('cash', 'bkash', 'bank', 'due')),
        ADD CONSTRAINT "chk_sales_bank_name"
          CHECK (
            ("payment_method" = 'bank' AND "bank_name" IS NOT NULL AND length(trim("bank_name")) > 0)
            OR ("payment_method" <> 'bank' AND "bank_name" IS NULL)
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
        DROP CONSTRAINT "chk_sales_bank_name",
        DROP CONSTRAINT "chk_sales_payment_method",
        DROP COLUMN "bank_name",
        ADD CONSTRAINT "chk_sales_payment_method"
          CHECK ("payment_method" IN ('cash', 'bkash', 'due'))
    `);
  }
}
