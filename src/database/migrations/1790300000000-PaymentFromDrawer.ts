import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Whether the money handed to a supplier came out of the shop's cash drawer.
 * Everything paid before this column existed did, which is what the default
 * says, so the day's cash figures keep their old meaning.
 */
export class PaymentFromDrawer1790300000000 implements MigrationInterface {
  name = 'PaymentFromDrawer1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "supplier_payments" ADD "from_drawer" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "supplier_payments" DROP COLUMN "from_drawer"`);
  }
}
