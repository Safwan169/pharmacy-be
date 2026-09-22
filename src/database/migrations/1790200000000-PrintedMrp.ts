import { MigrationInterface, QueryRunner } from 'typeorm';

/** The MRP printed on the pack, which is what a pharmacy sells at. */
export class PrintedMrp1790200000000 implements MigrationInterface {
  name = 'PrintedMrp1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" ADD "mrp" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "product_variants" ADD "pack_mrp" numeric(10,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "pack_mrp"`);
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "mrp"`);
  }
}
