import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleItemDiscount1791100000000 implements MigrationInterface {
  name = 'SaleItemDiscount1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_items" ADD "discount_amount" numeric(10,2) NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN "discount_amount"`);
  }
}
