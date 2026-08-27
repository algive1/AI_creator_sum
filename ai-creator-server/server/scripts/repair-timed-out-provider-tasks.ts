import dotenv from 'dotenv';
import path from 'path';
import { recoverTimedOutProviderTasks } from '../src/services/task-timeout-recovery.service';
import { endDbPool } from '../src/utils/db';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function readArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run') || !apply;
  const limitIndex = args.findIndex(item => item === '--limit');
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  if (apply && args.includes('--dry-run')) {
    throw new Error('Use either --dry-run or --apply, not both.');
  }
  return { apply: !dryRun, limit };
}

async function main() {
  const options = readArgs();
  const result = await recoverTimedOutProviderTasks(options);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('[repair-timed-out-provider-tasks] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await endDbPool().catch(() => undefined);
  });
