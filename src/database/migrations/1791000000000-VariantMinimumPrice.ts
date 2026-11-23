import { MigrationInterface, QueryRunner } from 'typeorm';

export class VariantMinimumPrice1791000000000 implements MigrationInterface {
  name = 'VariantMinimumPrice1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" ADD "minimum_price" numeric(10,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "minimum_price"`);
  }
}
