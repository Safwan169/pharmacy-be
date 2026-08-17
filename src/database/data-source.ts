import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnv();

/**
 * Standalone DataSource for the TypeORM CLI (`migration:generate`, `migration:run`).
 * The CLI can't read Nest's async `TypeOrmModule.forRootAsync` factory, so the
 * connection settings are re-read from the same environment variables here.
 *
 * Entities are matched by glob so new feature modules are picked up automatically.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + '/../modules/**/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  // Migrations own the schema; never let the CLI sync implicitly.
  synchronize: false,
});
