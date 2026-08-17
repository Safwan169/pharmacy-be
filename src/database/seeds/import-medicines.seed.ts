import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../app.module';
import { ImportService } from '../../modules/import/import.service';

const DEFAULT_CSV = path.join(process.cwd(), 'src', 'docs', 'medicine.csv');

/**
 * Loads the medicine catalogue from disk. Preferred over the HTTP upload for the
 * initial ~21.7k-row load, which takes long enough to risk an HTTP timeout.
 *
 * Usage: `npm run import:csv [-- path/to/medicine.csv]`
 */
async function importMedicines(): Promise<void> {
  const logger = new Logger('MedicineImport');
  const csvPath = process.argv[2] ?? DEFAULT_CSV;

  if (!fs.existsSync(csvPath)) {
    logger.error(`CSV not found at ${csvPath}`);
    process.exitCode = 1;
    return;
  }

  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    logger.log(`Importing from ${csvPath}`);
    const result = await appContext
      .get(ImportService)
      .importFromCsv(fs.readFileSync(csvPath));

    logger.log(
      `Done in ${result.durationMs}ms — ` +
        `${result.variantsCreated} variants created, ${result.variantsUpdated} updated, ` +
        `${result.rowsSkipped} rows skipped.`,
    );
    logger.log(
      `Catalogue now holds ${result.manufacturersTotal} manufacturers, ` +
        `${result.genericsTotal} generics, ${result.productsTotal} products, ` +
        `${result.variantsTotal} variants.`,
    );
    for (const skip of result.skipped) {
      logger.warn(`line ${skip.line}: ${skip.reason}`);
    }
  } finally {
    await appContext.close();
  }
}

importMedicines().catch((error: unknown) => {
  new Logger('MedicineImport').error(error);
  process.exitCode = 1;
});
