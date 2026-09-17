import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface BackupOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  /** Directory for dump files. Created if missing. */
  dir: string;
  /** Dumps older than this are deleted after a successful new one. */
  keepDays: number;
  /** Path to pg_dump / pg_restore; defaults to whatever is on PATH. */
  pgDumpPath?: string;
  pgRestorePath?: string;
}

export interface BackupFile {
  name: string;
  size_bytes: number;
  created_at: string;
}

const FILE_PATTERN = /^pharmacy-(\d{8})-(\d{4})\.dump$/;

/**
 * `pg_dump -Fc` into BACKUP_DIR as `pharmacy-YYYYMMDD-HHmm.dump`, then prune
 * dumps older than keepDays. The custom format is what `pg_restore` wants and
 * is compressed. Credentials go through PGPASSWORD, never the command line.
 */
export async function runBackup(options: BackupOptions): Promise<BackupFile> {
  fs.mkdirSync(options.dir, { recursive: true });
  const stamp = timestamp(new Date());
  const file = path.join(options.dir, `pharmacy-${stamp}.dump`);

  await execFileAsync(
    options.pgDumpPath ?? 'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--host=${options.host}`,
      `--port=${options.port}`,
      `--username=${options.username}`,
      `--dbname=${options.database}`,
      `--file=${file}`,
    ],
    { env: { ...process.env, PGPASSWORD: options.password }, maxBuffer: 64 * 1024 * 1024 },
  );

  pruneOld(options.dir, options.keepDays);
  return describe(file);
}

export async function runRestore(options: BackupOptions, file: string): Promise<void> {
  const resolved = path.isAbsolute(file) ? file : path.join(options.dir, file);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Backup file not found: ${resolved}`);
  }
  await execFileAsync(
    options.pgRestorePath ?? 'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      `--host=${options.host}`,
      `--port=${options.port}`,
      `--username=${options.username}`,
      `--dbname=${options.database}`,
      resolved,
    ],
    { env: { ...process.env, PGPASSWORD: options.password }, maxBuffer: 64 * 1024 * 1024 },
  );
}

export function listBackups(dir: string): BackupFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => FILE_PATTERN.test(name))
    .map((name) => describe(path.join(dir, name)))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

function pruneOld(dir: string, keepDays: number): void {
  const cutoff = Date.now() - keepDays * 86_400_000;
  for (const name of fs.readdirSync(dir)) {
    if (!FILE_PATTERN.test(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }
}

function describe(file: string): BackupFile {
  const stat = fs.statSync(file);
  return { name: path.basename(file), size_bytes: stat.size, created_at: stat.mtime.toISOString() };
}

function timestamp(d: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Reads the same env the app uses, for the CLI scripts and the admin endpoint. */
export function optionsFromEnv(): BackupOptions {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'pharmacy_db',
    dir: process.env.BACKUP_DIR ?? path.resolve(process.cwd(), 'backups'),
    keepDays: Number(process.env.BACKUP_KEEP_DAYS ?? 30),
    pgDumpPath: process.env.PG_DUMP_PATH || undefined,
    pgRestorePath: process.env.PG_RESTORE_PATH || undefined,
  };
}
