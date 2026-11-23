import { MigrationInterface, QueryRunner } from 'typeorm';

export class CounterStockSources1791200000000 implements MigrationInterface {
  name = 'CounterStockSources1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sale_items"
        ADD COLUMN "stock_source" varchar(20) NOT NULL DEFAULT 'tracked',
        ADD COLUMN "source_store_name" varchar(100),
        ADD CONSTRAINT "chk_sale_items_stock_source"
          CHECK ("stock_source" IN ('tracked', 'old_stock', 'borrowed')),
        ADD CONSTRAINT "chk_sale_items_source_store"
          CHECK (
            ("stock_source" = 'borrowed' AND "source_store_name" IS NOT NULL AND length(trim("source_store_name")) > 0)
            OR ("stock_source" <> 'borrowed' AND "source_store_name" IS NULL)
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sale_items"
        DROP CONSTRAINT "chk_sale_items_stock_source",
        DROP CONSTRAINT "chk_sale_items_source_store",
        DROP COLUMN "source_store_name",
        DROP COLUMN "stock_source"
    `);
  }
}
