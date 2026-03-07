import { closePool } from './pool.js';
import { runMigrations } from './migration-runner.js';

async function main(): Promise<void> {
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied migrations: ${applied.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error('Migration failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
