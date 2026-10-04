import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A delivery whose cost nobody knows.
 *
 * Stock that was already on the shelf when the shop started using this has a
 * count and a selling price and no invoice behind it. It still has to go in as
 * a delivery, because selling reads batches and nothing else — a count written
 * straight onto the medicine cannot be sold.
 *
 * The only thing standing in the way was that a receipt line had to name a
 * cost. `stock_batches.cost_price` has always been nullable, and both reports
 * that touch cost already count what they cannot cost rather than assuming
 * zero: the profit report returns `uncosted_lines`, the stock value report
 * `uncosted_units`. Passing nothing is therefore already understood
 * everywhere downstream; only the write path insisted on a number, and a zero
 * would have been read as "it cost nothing", which is a different claim and a
 * false one.
 */
export class ReceiptCostOptional1790800000000 implements MigrationInterface {
  name = 'ReceiptCostOptional1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_receipt_items" ALTER COLUMN "unit_cost" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipt_items" ALTER COLUMN "line_cost" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lines written without a cost have to say something to go back under the
    // constraint, and zero is the only number available.
    await queryRunner.query(
      `UPDATE "stock_receipt_items" SET "unit_cost" = 0 WHERE "unit_cost" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "stock_receipt_items" SET "line_cost" = 0 WHERE "line_cost" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipt_items" ALTER COLUMN "unit_cost" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipt_items" ALTER COLUMN "line_cost" SET NOT NULL`,
    );
  }
}
