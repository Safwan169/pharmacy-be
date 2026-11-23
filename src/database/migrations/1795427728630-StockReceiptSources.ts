import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockReceiptSources1795427728630 implements MigrationInterface {
  name = 'StockReceiptSources1795427728630';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_receipts"
        ADD COLUMN "source_type" varchar(20) NOT NULL DEFAULT 'supplier',
        ADD COLUMN "source_name" varchar(100),
        ADD CONSTRAINT "chk_stock_receipts_source_type"
          CHECK ("source_type" IN ('supplier', 'borrow', 'uncounted_old')),
        ADD CONSTRAINT "chk_stock_receipts_source_name"
          CHECK (
            ("source_type" = 'borrow' AND "source_name" IS NOT NULL AND length(trim("source_name")) > 0)
            OR ("source_type" <> 'borrow' AND "source_name" IS NULL)
          )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stock_receipts_source_name" ON "stock_receipts" ("source_name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_stock_receipts_source_name"`,
    );
    await queryRunner.query(`
      ALTER TABLE "stock_receipts"
        DROP CONSTRAINT "chk_stock_receipts_source_type",
        DROP CONSTRAINT "chk_stock_receipts_source_name",
        DROP COLUMN "source_name",
        DROP COLUMN "source_type"
    `);
  }
}
