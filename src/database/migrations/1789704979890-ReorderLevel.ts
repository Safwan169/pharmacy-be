import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-SKU restock threshold; NULL falls back to the shop-wide setting. */
export class ReorderLevel1789704979890 implements MigrationInterface {
  name = 'ReorderLevel1789704979890';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD "reorder_level" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD CONSTRAINT "chk_variants_reorder_level" CHECK ("reorder_level" IS NULL OR "reorder_level" >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "chk_variants_reorder_level"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN "reorder_level"`,
    );
  }
}
