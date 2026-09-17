import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two roles instead of one admin. `owner` does everything; `cashier` can sell,
 * look things up and take returns, but can't change prices, receive stock or
 * see the money reports. Existing admins become owners.
 */
export class UserRoles1789658058350 implements MigrationInterface {
  name = 'UserRoles1789658058350';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
         ADD COLUMN "name" VARCHAR(100),
         ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`UPDATE "users" SET "role" = 'owner' WHERE "role" = 'admin'`);
    await queryRunner.query(
      `ALTER TABLE "users"
         ADD CONSTRAINT "chk_users_role" CHECK ("role" IN ('owner', 'cashier'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_role"`);
    await queryRunner.query(`UPDATE "users" SET "role" = 'admin' WHERE "role" = 'owner'`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "is_active", DROP COLUMN "name"`,
    );
  }
}
