import { MigrationInterface, QueryRunner } from 'typeorm';

/** Who changed what: prices, units, stock counts, users, settings. */
export class AuditLog1789988507570 implements MigrationInterface {
  name = 'AuditLog1789988507570';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" SERIAL NOT NULL,
        "user_id" integer,
        "action" character varying(40) NOT NULL,
        "entity_type" character varying(30) NOT NULL,
        "entity_id" integer,
        "summary" character varying(255) NOT NULL,
        "details" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_log" PRIMARY KEY ("id"),
        CONSTRAINT "fk_audit_log_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_audit_log_created" ON "audit_log" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_log_entity" ON "audit_log" ("entity_type", "entity_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_log"`);
  }
}
