import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve(__dirname, '../src/migrations');
const unsupportedRoutinePattern = /\bDELIMITER\b|\bCREATE\s+(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i;
const forbiddenDropPattern = /\b(DROP\s+DATABASE|TRUNCATE)\b|\bDROP\s+(?!TEMPORARY\s+TABLE\b)/i;

interface Finding {
  file: string;
  message: string;
}

function readSqlFiles(): string[] {
  if (!fs.existsSync(migrationsDir)) throw new Error(`migrations directory not found: ${migrationsDir}`);
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function collectFindings(file: string): Finding[] {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
  const executableSql = stripSqlLiteralsAndComments(sql);
  const findings: Finding[] = [];

  if (unsupportedRoutinePattern.test(executableSql)) {
    findings.push({ file, message: 'contains DELIMITER/PROCEDURE/FUNCTION/TRIGGER/EVENT, unsupported by the migration statement splitter' });
  }

  if (forbiddenDropPattern.test(executableSql)) {
    findings.push({ file, message: 'contains forbidden DROP/TRUNCATE statement; use guarded dynamic SQL or manual migration' });
  }

  const directAlter = executableSql.match(/(^|\n)\s*ALTER\s+TABLE\b(?![\s\S]*?\bMODIFY\s+COLUMN\b)/ig) || [];
  for (const _match of directAlter) {
    const before = sql.slice(0, sql.indexOf(_match));
    const nearby = before.slice(Math.max(0, before.length - 500));
    if (!/information_schema\.(columns|statistics)/i.test(nearby)) {
      findings.push({ file, message: 'contains direct ALTER TABLE without nearby information_schema guard' });
      break;
    }
  }

  return findings;
}

function stripSqlLiteralsAndComments(sql: string): string {
  let output = '';
  let quote: "'" | '"' | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let atLineStart = true;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false;
        output += ch;
        atLineStart = true;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      } else if (ch === '\n' || ch === '\r') {
        output += ch;
        atLineStart = true;
      }
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        if (next) i += 1;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          i += 1;
          continue;
        }
        quote = null;
      }
      output += ' ';
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      output += ' ';
      atLineStart = false;
      continue;
    }

    if (ch === '-' && next === '-' && (atLineStart || sql[i + 2] === undefined || /\s/.test(sql[i + 2]))) {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === '#') {
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    output += ch;
    if (ch === '\n' || ch === '\r') {
      atLineStart = true;
    } else if (!/\s/.test(ch)) {
      atLineStart = false;
    }
  }

  return output;
}

function main(): void {
  const files = readSqlFiles();
  const findings = files.flatMap(collectFindings);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`[migration-idempotent] ${finding.file}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`check:migrations-idempotent passed (${files.length} files scanned)`);
}

main();
