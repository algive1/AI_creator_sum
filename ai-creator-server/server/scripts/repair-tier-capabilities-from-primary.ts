import { repairTierCapabilitiesFromPrimaryModels } from '../src/services/tier-capability-sync.service';
import { endDbPool } from '../src/utils/db';

async function main(): Promise<void> {
  const results = await repairTierCapabilitiesFromPrimaryModels();
  const repaired = results.filter((item) => item.synced).length;
  const skipped = results.length - repaired;
  console.log(JSON.stringify({ repaired, skipped, results }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await endDbPool().catch(() => undefined);
  });
