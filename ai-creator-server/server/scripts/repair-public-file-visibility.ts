import { preloadStorageConfigs } from '../src/services/storage/storage-config-loader';
import { StorageService } from '../src/services/storage/storage.service';
import { query } from '../src/utils/db';

interface FileRow {
  id: number;
  file_no: string;
  storage_key: string;
  provider: string;
  visibility: 'public' | 'private';
}

async function main() {
  await preloadStorageConfigs();
  const adapter = StorageService.getActiveAdapter();
  if (typeof adapter.setVisibility !== 'function') {
    console.log(`[skip] provider ${adapter.provider} does not support setVisibility`);
    return;
  }

  const rows = await query<FileRow>(
    `SELECT id, file_no, storage_key, provider, visibility
       FROM files
      WHERE is_deleted = 0
        AND visibility = 'public'
        AND provider = ?
      ORDER BY id ASC`,
    [adapter.provider],
  );

  let repaired = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await adapter.setVisibility!(row.storage_key, 'public');
      repaired += 1;
      console.log(`[ok] ${row.file_no} ${row.storage_key}`);
    } catch (error: any) {
      failed += 1;
      console.error(`[fail] ${row.file_no} ${row.storage_key}: ${error?.message || error}`);
    }
  }

  console.log(JSON.stringify({
    provider: adapter.provider,
    total: rows.length,
    repaired,
    failed,
  }));
}

main().catch((error) => {
  console.error('[repair-public-file-visibility] failed:', error?.message || error);
  process.exit(1);
});
