import 'dotenv/config';
import { listBackups, optionsFromEnv, runBackup, runRestore } from '../backup';

/**
 * `npm run backup`            → new dump in BACKUP_DIR, old ones pruned
 * `npm run restore -- <file>` → pg_restore that dump over the current database
 * `npm run backup -- --list`  → what's there
 *
 * Schedule `npm run backup` nightly (Windows Task Scheduler / cron).
 */
async function main(): Promise<void> {
  const options = optionsFromEnv();
  const [command, arg] = process.argv.slice(2);

  if (command === '--list') {
    for (const f of listBackups(options.dir)) {
      console.log(`${f.name}\t${(f.size_bytes / 1024).toFixed(0)} KB\t${f.created_at}`);
    }
    return;
  }
  if (command === '--restore') {
    if (!arg) throw new Error('Usage: npm run restore -- <file>');
    await runRestore(options, arg);
    console.log(`Restored ${arg} into ${options.database}.`);
    return;
  }
  const file = await runBackup(options);
  console.log(`Backed up to ${options.dir}/${file.name} (${(file.size_bytes / 1024).toFixed(0)} KB).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
