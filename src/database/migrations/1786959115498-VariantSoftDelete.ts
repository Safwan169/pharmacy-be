import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft delete for variants.
 *
 * A hard DELETE is not available to the API: `sale_items.product_variant_id`
 * references this table with no ON DELETE rule, so removing a variant that has
 * ever been sold would fail — and if that constraint were relaxed it would
 * destroy the line items past invoices are rendered from. Deactivating instead
 * takes the SKU out of the catalogue while leaving sales history intact.
 *
 * Existing rows default to active, so this is a no-op for current data.
 */
export class VariantSoftDelete1786959115498 implements MigrationInterface {
  name = 'VariantSoftDelete1786959115498';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants"
         ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN "is_active"`,
    );
  }
}
