import * as Joi from 'joi';

/**
 * Shape of the validated, namespaced configuration exposed through ConfigService.
 * Access it with `configService.getOrThrow<T>('database.host')` and friends.
 */
export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  /** Empty means every origin is allowed. */
  corsOrigins: string[];
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    synchronize: boolean;
    ssl: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  admin: {
    email: string;
    password: string;
  };
  lowStockThreshold: number;
}

/**
 * Validated at startup by ConfigModule so a missing/DB-breaking env var fails the
 * boot instead of surfacing later as a runtime error on the first query.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  // Allowed to be empty for local Postgres installs configured with trust auth.
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  // Lets TypeORM create/update the schema from the entities. Convenient in
  // development; must stay false in production, where migrations own the schema.
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  // Hosted Postgres (Render, Neon, Supabase…) only accepts TLS connections.
  DB_SSL: Joi.boolean().default(false),

  // Comma-separated browser origins allowed to call the API, e.g.
  // "https://shop.example.com,http://localhost:3001". Empty = any origin.
  CORS_ORIGIN: Joi.string().allow('').default(''),

  // Length isn't enforced so any value works locally, but this must be a long
  // random string in production — it is the only thing protecting token forgery.
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),

  // A variant counts as low stock below this number. Configurable so the
  // pharmacy can retune it without a code change; one global value for now.
  LOW_STOCK_THRESHOLD: Joi.number().integer().min(1).default(5),

  // Backups: where pg_dump writes and how long dumps are kept. Optional —
  // defaults to ./backups and 30 days. PG_DUMP_PATH/PG_RESTORE_PATH point at
  // the binaries when they are not on PATH (typical on Windows).
  BACKUP_DIR: Joi.string().optional(),
  BACKUP_KEEP_DAYS: Joi.number().integer().min(1).default(30),
  PG_DUMP_PATH: Joi.string().allow('').optional(),
  PG_RESTORE_PATH: Joi.string().allow('').optional(),
});

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV as string,
  port: Number(process.env.PORT),
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  database: {
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME as string,
    password: process.env.DB_PASSWORD as string,
    name: process.env.DB_NAME as string,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN as string,
  },
  admin: {
    email: process.env.ADMIN_EMAIL as string,
    password: process.env.ADMIN_PASSWORD as string,
  },
  lowStockThreshold: Number(process.env.LOW_STOCK_THRESHOLD),
});
