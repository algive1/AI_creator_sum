import fs from 'fs';
import path from 'path';

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map(item => path.resolve(item))));
}

function defaultRuntimeBaseDir(): string {
  return path.resolve(__dirname, '..');
}

export function runtimeVersionCandidates(baseDir = defaultRuntimeBaseDir(), cwd = process.cwd()): string[] {
  return uniquePaths([
    path.resolve(baseDir, '../../release.json'),
    path.resolve(cwd, '../release.json'),
    path.resolve(baseDir, '../package.json'),
    path.resolve(cwd, 'package.json'),
  ]);
}

export function readRuntimeReleaseVersion(baseDir = defaultRuntimeBaseDir(), cwd = process.cwd()): string {
  for (const filePath of runtimeVersionCandidates(baseDir, cwd)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed?.version) return String(parsed.version);
    } catch {
      // Ignore invalid optional version files.
    }
  }
  return 'unknown';
}
