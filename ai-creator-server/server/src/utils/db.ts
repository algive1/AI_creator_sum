// src/utils/db.ts
import os from 'os';
import mysql from 'mysql2/promise';
import { config } from './config';

const connectionLimit = Math.max(3, os.cpus().length * 2 + 1);
const acquireTimeout = positiveInt(process.env.DB_ACQUIRE_TIMEOUT_MS, 10000);

function positiveInt(value: any, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit,
    queueLimit: positiveInt(process.env.DB_QUEUE_LIMIT, 50),
    connectTimeout: positiveInt(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
    enableKeepAlive: true,
    keepAliveInitialDelay: positiveInt(process.env.DB_KEEP_ALIVE_INITIAL_DELAY_MS, 10000),
    charset: 'utf8mb4',
    timezone: '+08:00',
  });
}

let pool = createPool();

export function resetDbPool(): void {
  const oldPool = pool;
  pool = createPool();
  setTimeout(() => {
    oldPool.end().catch(() => undefined);
  }, 30000);
}

export async function endDbPool(): Promise<void> {
  await pool.end();
}

export default pool;

export async function getConnection(): Promise<mysql.PoolConnection> {
  return withAcquireTimeout(pool.getConnection());
}

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return Array.isArray(rows) ? rows as T[] : [rows as T];
}

export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function getDbPoolMetrics() {
  const internalPool = (pool as any).pool || pool as any;
  const total = Number(internalPool?._allConnections?.length || 0);
  const idle = Number(internalPool?._freeConnections?.length || 0);
  return {
    connectionLimit,
    acquireTimeout,
    total,
    active: Math.max(0, total - idle),
    idle,
    queued: Number(internalPool?._connectionQueue?.length || 0),
  };
}

async function withAcquireTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`DB connection acquire timeout after ${acquireTimeout}ms`));
        }, acquireTimeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
