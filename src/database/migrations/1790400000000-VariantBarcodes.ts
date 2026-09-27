import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Barcodes printed on the packs a shop actually stocks. The catalogue came
 * from a public medicine list that carries no barcodes, so each code is
 * learned the first time it is scanned and remembered from then on. A code
 * belongs to one medicine, but a medicine may answer to several — repackaged
 * strips and imported boxes carry different numbers.
 */
export class VariantBarcodes1790400000000 implements MigrationInterface {
  name = 'VariantBarcodes1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "variant_barcodes" (
        "id" SERIAL NOT NULL,
        "variant_id" integer NOT NULL,
        "code" character varying(64) NOT NULL,
        "note" character varying(120),
        "created_by" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_variant_barcodes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_variant_barcodes_code" UNIQUE ("code"),
        CONSTRAINT "fk_variant_barcodes_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_variant_barcodes_user" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_variant_barcodes_variant" ON "variant_barcodes" ("variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "variant_barcodes"`);
  }
}
