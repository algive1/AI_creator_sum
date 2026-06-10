import '../src/utils/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/utils/config';
import { syncDeploymentConfigsFromEnv } from '../src/services/deploy-config-sync.service';
import { syncProviderApiKeysFromEnv } from '../src/services/provider-key-sync.service';

interface MigrationFile {
  key: string;
  filename: string;
  path: string;
  sql: string;
  checksum: string;
}

const migrationsDir = path.resolve(__dirname, '../src/migrations');
const forbiddenPattern = /\b(DROP\s+DATABASE|TRUNCATE)\b/i;
const unsupportedDelimiterPattern = /\bDELIMITER\b|\bCREATE\s+(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i;

function checksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function migrationKey(filename: string): string {
  return filename.replace(/\.sql$/i, '');
}

function readMigrations(): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error('Migrations directory not found: ' + migrationsDir);
  }

  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map(filename => {
      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      return { key: migrationKey(filename), filename, path: filePath, sql, checksum: checksum(sql) };
    });
}

function removeSqlComments(sql: string) {
  let output = '';
  let quote: "'" | '"' | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let atLineStart = true;

  for (let i = 0; i < sql.length; i++) {
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
        i++;
      } else if (ch === '\n' || ch === '\r') {
        output += ch;
        atLineStart = true;
      }
      continue;
    }

    if (quote) {
      output += ch;
      if (ch === '\\') {
        if (next) output += sql[++i];
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          output += sql[++i];
          continue;
        }
        quote = null;
      }
      atLineStart = false;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      output += ch;
      atLineStart = false;
      continue;
    }

    if (ch === '-' && next === '-' && (atLineStart || sql[i + 2] === undefined || /\s/.test(sql[i + 2]))) {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '#') {
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
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

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    current += ch;

    if (quote) {
      if (ch === '\\') {
        if (next) current += sql[++i];
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          current += sql[++i];
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === ';') {
      statements.push(current.slice(0, -1).trim());
      current = '';
    }
  }

  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

async function tableExists(conn: mysql.Connection, tableName: string): Promise<boolean> {
  const [rows] = await conn.execute(
    'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [config.db.database, tableName],
  ) as any;
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function hasSuccessfulMigration(conn: mysql.Connection, key: string): Promise<boolean> {
  if (!await tableExists(conn, 'schema_migrations')) return false;
  const [rows] = await conn.execute(
    'SELECT id FROM schema_migrations WHERE migration_key = ? AND success = 1 LIMIT 1',
    [key],
  ) as any;
  return rows.length > 0;
}

async function recordMigration(conn: mysql.Connection, migration: MigrationFile, success: boolean, errorMessage = '') {
  if (!await tableExists(conn, 'schema_migrations')) return;

  await conn.execute(
    `INSERT INTO schema_migrations (migration_key, filename, checksum, executed_at, success, error_message)
     VALUES (?, ?, ?, NOW(3), ?, ?)
     ON DUPLICATE KEY UPDATE filename = VALUES(filename), checksum = VALUES(checksum),
       executed_at = VALUES(executed_at), success = VALUES(success), error_message = VALUES(error_message)`,
    [
      migration.key,
      migration.filename,
      migration.checksum,
      success ? 1 : 0,
      errorMessage ? errorMessage.slice(0, 2000) : null,
    ],
  );
}

async function executeStatements(conn: mysql.Connection, migration: MigrationFile) {
  const sqlWithoutComments = removeSqlComments(migration.sql);
  if (forbiddenPattern.test(sqlWithoutComments)) {
    throw new Error('Forbidden SQL found: DROP DATABASE or TRUNCATE');
  }
  if (unsupportedDelimiterPattern.test(sqlWithoutComments)) {
    throw new Error('Unsupported SQL found: DELIMITER/PROCEDURE/FUNCTION/TRIGGER/EVENT migrations are not safe with the built-in statement splitter');
  }

  const statements = splitSqlStatements(sqlWithoutComments);
  if (statements.length === 0) {
    throw new Error('Migration has no executable SQL statements');
  }

  for (const statement of statements) {
    await conn.query(statement);
  }
}

async function runMigration(conn: mysql.Connection, migration: MigrationFile) {
  if (await hasSuccessfulMigration(conn, migration.key)) {
    console.log(`skip ${migration.filename}`);
    return;
  }

  console.log(`run ${migration.filename}`);
  try {
    await conn.beginTransaction();
    await executeStatements(conn, migration);
    await recordMigration(conn, migration, true);
    await conn.commit();
    console.log(`done ${migration.filename}`);
  } catch (err: any) {
    try { await conn.rollback(); } catch {}
    const message = err?.message || String(err);
    try { await recordMigration(conn, migration, false, message); } catch {}
    throw new Error(`${migration.filename} failed: ${message}`, { cause: err });
  }
}

async function main() {
  const migrations = readMigrations();
  if (migrations.length === 0) {
    console.log('No migrations found');
    return;
  }

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false,
  });

  try {
    for (const migration of migrations) {
      await runMigration(conn, migration);
    }
    const syncedKeys = await syncProviderApiKeysFromEnv(conn);
    if (syncedKeys.length > 0) {
      const labels = syncedKeys
        .filter(item => item.updated)
        .map(item => `${item.providerKey}<=${item.envKey}`)
        .join(', ');
      console.log(labels ? `provider api keys synced: ${labels}` : 'provider api key env found, but no matching provider rows were updated');
    }
    const syncedConfigs = await syncDeploymentConfigsFromEnv(conn);
    if (syncedConfigs.length > 0) {
      const labels = syncedConfigs
        .filter(item => item.updated)
        .map(item => `${item.configKey}<=${item.envKey}`)
        .join(', ');
      console.log(labels ? `deployment configs synced: ${labels}` : 'deployment config env found, but no database values were updated');
    }
  } finally {
    await conn.end();
  }

  console.log('db:migrate passed');
}

main().catch(err => {
  console.error('db:migrate failed:', err.message || err);
  process.exit(1);
});
