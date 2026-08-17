import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Full baseline schema: the auth `users` table plus the medicine catalogue.
 *
 * Note on `product_variants.slug`: the source CSV's slugs are NOT unique — 111
 * slugs are shared by 234 rows, both within a brand and across unrelated
 * manufacturers. The importer keeps the column unique by appending the row's
 * `legacy_brand_id` to any slug that collides, which is deterministic and so
 * survives a re-import unchanged.
 */
export class InitialSchema1786941816871 implements MigrationInterface {
  name = 'InitialSchema1786941816871';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            SERIAL PRIMARY KEY,
        "email"         VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "role"          VARCHAR(20) NOT NULL DEFAULT 'admin',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "manufacturers" (
        "id"         SERIAL PRIMARY KEY,
        "name"       VARCHAR(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_manufacturers_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "generics" (
        "id"         SERIAL PRIMARY KEY,
        "name"       VARCHAR(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_generics_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"              SERIAL PRIMARY KEY,
        "brand_name"      VARCHAR(255) NOT NULL,
        "manufacturer_id" INTEGER NOT NULL REFERENCES "manufacturers"("id"),
        "type"            VARCHAR(20) NOT NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_products_brand_manufacturer" UNIQUE ("brand_name", "manufacturer_id"),
        CONSTRAINT "chk_products_type" CHECK ("type" IN ('allopathic', 'herbal'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_products_brand_name" ON "products" ("brand_name")`,
    );

    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id"               SERIAL PRIMARY KEY,
        "product_id"       INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "generic_id"       INTEGER REFERENCES "generics"("id"),
        "dosage_form"      VARCHAR(100) NOT NULL,
        "strength"         VARCHAR(100),
        "slug"             VARCHAR(255),
        "legacy_brand_id"  INTEGER,
        "price"            NUMERIC(10,2),
        "stock_quantity"   INTEGER,
        "price_updated_at" TIMESTAMPTZ,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_variants_slug" UNIQUE ("slug"),
        CONSTRAINT "uq_variants_legacy_brand_id" UNIQUE ("legacy_brand_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_variants_product" ON "product_variants" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_variants_generic" ON "product_variants" ("generic_id")`,
    );
    // Partial index backing the admin's "needs pricing" worklist.
    await queryRunner.query(
      `CREATE INDEX "idx_variants_price_null" ON "product_variants" ("id") WHERE "price" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "generics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manufacturers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
