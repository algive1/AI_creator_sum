import { runInstallWorkerFromContextFile } from '../services/update-package.service';

async function main() {
  const contextPath = process.argv[2] || '';
  await runInstallWorkerFromContextFile(contextPath);
}

main().catch((err: any) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
