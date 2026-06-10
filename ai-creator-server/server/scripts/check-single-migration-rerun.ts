import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const cfg = {
  host: process.env.CHECK_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.CHECK_DB_PORT || process.env.DB_PORT || '3306', 10),
  database: process.env.CHECK_DB_NAME || 'ai_creator_migration_rerun_check',
  user: process.env.CHECK_DB_USER || process.env.DB_USER || 'root',
  password: process.env.CHECK_DB_PASSWORD || process.env.DB_PASSWORD || '',
};
const migrationFile = path.resolve(__dirname, '../src/migrations/20260602_002_fix_invite_code_index.sql');

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;
  for (let i = 0; i < sql.length; i += 1) {
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

async function runSql(conn: mysql.Connection, sql: string): Promise<void> {
  for (const statement of splitSqlStatements(sql.replace(/^\uFEFF/, ''))) {
    await conn.query(statement);
  }
}

async function indexSummary(conn: mysql.Connection): Promise<any> {
  const [rows] = await conn.query(
    `SELECT index_name, non_unique, COUNT(*) AS parts
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = 'user_invites' AND index_name = 'uk_invite_code'
      GROUP BY index_name, non_unique`,
    [cfg.database],
  );
  return (rows as any[])[0] || null;
}

async function main(): Promise<void> {
  if (cfg.database === process.env.DB_NAME) throw new Error('CHECK_DB_NAME cannot equal DB_NAME');
  const root = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await root.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(cfg.database)}`);
  await root.query(`CREATE DATABASE ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
  try {
    await conn.query(
      `CREATE TABLE user_invites (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invite_code VARCHAR(32) NOT NULL,
        UNIQUE INDEX uk_invite_code (invite_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    const sql = fs.readFileSync(migrationFile, 'utf8');
    await runSql(conn, sql);
    await runSql(conn, sql);
    const summary = await indexSummary(conn);
    const nonUnique = Number(summary?.non_unique ?? summary?.NON_UNIQUE);
    const parts = Number(summary?.parts ?? summary?.PARTS);
    if (!summary || nonUnique !== 1 || parts !== 1) {
      throw new Error(`unexpected index summary: ${JSON.stringify(summary)}`);
    }
    console.log(JSON.stringify({ migration: path.basename(migrationFile), secondRun: 'ok', index: summary }, null, 2));
    console.log('check:single-migration-rerun passed');
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('check:single-migration-rerun failed:', err.message || err);
  process.exitCode = 1;
});
