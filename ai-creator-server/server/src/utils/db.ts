// src/utils/db.ts
import mysql from 'mysql2/promise';
import { config } from './config';

function createPool(): mysql.Pool {
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 50,            // 排队上限，超出立即报错而非无限等待
    connectTimeout: 10000,       // 10 秒连不上就报错
    enableKeepAlive: true,       // TCP keep-alive，防中间设备断开空闲连接
    keepAliveInitialDelay: 10000, // 10 秒心跳间隔
    charset: 'utf8mb4',
    timezone: '+08:00',
  });
}

let pool = createPool();

/**
 * 替换连接池（配置热更新时调用）。
 * 旧池延迟 30 秒关闭，给进行中的查询充足的完成时间。
 */
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
  return pool.getConnection();
}

export async function query<T>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return Array.isArray(rows) ? rows as T[] : [rows as T];
}

export async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
