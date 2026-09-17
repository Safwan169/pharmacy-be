import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sellable units per SKU.
 *
 * A tablet can be sold loose, by the strip or by the box, each at its own
 * price; a syrup only as a bottle. `product_variants.stock_quantity` becomes
 * the count in the *base unit* (tablet, bottle, vial…) and `variant_units`
 * holds the ladder above it. Sale lines snapshot the unit they were sold in.
 *
 * Existing priced variants get a single base-unit row so nothing that sells
 * today stops selling.
 */
export class VariantUnits1789654693108 implements MigrationInterface {
  name = 'VariantUnits1789654693108';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants"
         ADD COLUMN "base_unit" VARCHAR(30) NOT NULL DEFAULT 'piece',
         ADD COLUMN "pack_size" INTEGER`,
    );

    // Same rules as baseUnitForDosageForm(), applied to rows already imported.
    await queryRunner.query(
      `UPDATE "product_variants" SET "base_unit" = CASE
         WHEN lower("dosage_form") LIKE '%tablet%' THEN 'tablet'
         WHEN lower("dosage_form") LIKE '%capsule%' THEN 'capsule'
         WHEN lower("dosage_form") LIKE '%injection%'
           OR lower("dosage_form") LIKE '%infusion%' THEN 'vial'
         WHEN lower("dosage_form") LIKE '%sachet%' THEN 'sachet'
         WHEN lower("dosage_form") LIKE '%syrup%'
           OR lower("dosage_form") LIKE '%suspension%'
           OR lower("dosage_form") LIKE '%solution%'
           OR lower("dosage_form") LIKE '%drops%'
           OR lower("dosage_form") LIKE '%emulsion%'
           OR lower("dosage_form") LIKE '%elixir%'
           OR lower("dosage_form") LIKE '%mouthwash%' THEN 'bottle'
         WHEN lower("dosage_form") LIKE '%cream%'
           OR lower("dosage_form") LIKE '%ointment%'
           OR lower("dosage_form") LIKE '%gel%'
           OR lower("dosage_form") LIKE '%lotion%'
           OR lower("dosage_form") LIKE '%paste%' THEN 'tube'
         WHEN lower("dosage_form") LIKE '%powder%' THEN 'sachet'
         ELSE 'piece'
       END`,
    );

    await queryRunner.query(`
      CREATE TABLE "variant_units" (
        "id" SERIAL PRIMARY KEY,
        "variant_id" INTEGER NOT NULL
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        "name" VARCHAR(30) NOT NULL,
        "qty_in_base" INTEGER NOT NULL,
        "price" NUMERIC(10,2),
        "is_sellable" BOOLEAN NOT NULL DEFAULT true,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" SMALLINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_variant_units_variant_name" UNIQUE ("variant_id", "name"),
        CONSTRAINT "chk_variant_units_qty" CHECK ("qty_in_base" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_variant_units_variant" ON "variant_units" ("variant_id")`,
    );

    // Every variant priced so far sells by its base unit at that price.
    await queryRunner.query(`
      INSERT INTO "variant_units"
        ("variant_id", "name", "qty_in_base", "price", "is_sellable", "is_default", "sort_order")
      SELECT "id", "base_unit", 1, "price", true, true, 0
      FROM "product_variants"
      WHERE "price" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "sale_items"
         ADD COLUMN "unit_name_snapshot" VARCHAR(30) NOT NULL DEFAULT 'piece',
         ADD COLUMN "qty_in_base" INTEGER NOT NULL DEFAULT 1,
         ADD COLUMN "base_qty_deducted" INTEGER NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "sale_items" si
         SET "base_qty_deducted" = si."quantity",
             "unit_name_snapshot" = pv."base_unit"
       FROM "product_variants" pv
       WHERE pv."id" = si."product_variant_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items"
         DROP COLUMN "base_qty_deducted",
         DROP COLUMN "qty_in_base",
         DROP COLUMN "unit_name_snapshot"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "variant_units"`);
    await queryRunner.query(
      `ALTER TABLE "product_variants"
         DROP COLUMN "pack_size",
         DROP COLUMN "base_unit"`,
    );
  }
}
