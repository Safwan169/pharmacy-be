import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which pack a code is printed on. A barcode lives on the box, not on the
 * strip inside it, so scanning one should ring up a box — without this the
 * counter can only guess at the medicine's default unit. Null for codes
 * learned before this was recorded, and for anything paired without knowing.
 */
export class BarcodeUnit1790500000000 implements MigrationInterface {
  name = 'BarcodeUnit1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "variant_barcodes" ADD "unit_id" integer`);
    await queryRunner.query(`
      ALTER TABLE "variant_barcodes"
      ADD CONSTRAINT "fk_variant_barcodes_unit" FOREIGN KEY ("unit_id")
        REFERENCES "variant_units"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "variant_barcodes" DROP CONSTRAINT "fk_variant_barcodes_unit"`,
    );
    await queryRunner.query(`ALTER TABLE "variant_barcodes" DROP COLUMN "unit_id"`);
  }
}
