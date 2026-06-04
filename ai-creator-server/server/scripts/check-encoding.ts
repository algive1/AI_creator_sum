import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');

const scanRoots = [
  path.join(root, 'README.md'),
  path.join(root, 'PROJECT_STATE.md'),
  path.join(root, 'scripts'),
  path.join(root, 'server', '.env.example'),
  path.join(root, 'server', 'src'),
  path.join(root, 'server', 'scripts'),
  path.join(root, 'admin-web', 'src'),
  path.join(root, 'docs'),
];

const ignoredDirs = new Set(['node_modules', 'dist', 'build', '.git', '.release-staging']);
const textExts = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yml', '.yaml',
  '.css', '.scss', '.html', '.sql', '.sh',
]);

const mojibakePatterns = [
  /锟/,
  /锟斤拷/,
  /\uFFFD/,
  /Ã/,
  /Â/,
  /ä¸/,
  /脙/,
  /閿/,
  /閳/,
  /閸/,
  /鍩/,
  /鑾/,
  /鏄/,
  /寰/,
  /閰/,
  /瀛/,
  /绯/,
  /妯/,
  /鐢/,
  /缂/,
  /绋/,
  /娆/,
  /鐨/,
  /鍙/,
  /鍚/,
  /涓/,
];

interface Hit {
  file: string;
  line: number;
  text: string;
}

function isTextFile(file: string): boolean {
  return textExts.has(path.extname(file)) || path.basename(file) === '.env.example';
}

function walk(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    return isTextFile(target) ? [target] : [];
  }

  if (!stat.isDirectory()) return [];

  const entries = fs.readdirSync(target, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && isTextFile(full)) {
      files.push(full);
    }
  }

  return files;
}

function hasMojibake(line: string): boolean {
  return mojibakePatterns.some(pattern => pattern.test(line));
}

function stripStringContent(line: string): string {
  return line
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/`([^`\\]|\\.)*`/g, '``');
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--') || trimmed.startsWith('#');
}

function hasSuspiciousQuestionMarks(line: string): boolean {
  if (!line.includes('??')) return false;

  const codeWithoutStrings = stripStringContent(line);
  if (codeWithoutStrings.includes('??')) {
    const allowedCode = /\?\?\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|\d+|true|false|null|undefined|''|""|``|\[|\{)/g;
    const remaining = codeWithoutStrings.replace(allowedCode, '');
    if (!remaining.includes('??')) return false;
  }

  return (
    isCommentLine(line) ||
    /(['"`])[^'"`]*\?\?[^'"`]*\1/.test(line) ||
    />[^<]*\?\?[^<]*</.test(line)
  );
}

function scanFile(file: string): Hit[] {
  if (path.basename(file) === 'check-encoding.ts' && file.includes(`${path.sep}server${path.sep}scripts${path.sep}`)) {
    return [];
  }

  const raw = fs.readFileSync(file);
  const content = raw.toString('utf8');
  const lines = content.split(/\r?\n/);
  const hits: Hit[] = [];

  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    hits.push({ file, line: 1, text: 'UTF-8 BOM detected' });
  }

  lines.forEach((line, index) => {
    if (hasMojibake(line) || hasSuspiciousQuestionMarks(line)) {
      hits.push({
        file,
        line: index + 1,
        text: line.trim().slice(0, 180),
      });
    }
  });

  return hits;
}

const files = Array.from(new Set(scanRoots.flatMap(walk)));
const hits = files.flatMap(scanFile);

for (const hit of hits) {
  const rel = path.relative(root, hit.file).replace(/\\/g, '/');
  console.log(`${rel}:${hit.line} ${hit.text}`);
}

process.exit(hits.length > 0 ? 1 : 0);
