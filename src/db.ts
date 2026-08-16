import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required database environment variable: ${name}. ` +
        'Set DB_HOST, DB_USER and DB_NAME (and optionally DB_PORT, DB_PASSWORD, DB_CONNECTION_LIMIT).',
    );
  }
  return value.trim();
}

function toPort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 3306;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid DB_PORT: ${value}`);
  }
  return n;
}

function toConnectionLimit(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 10;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid DB_CONNECTION_LIMIT: ${value}`);
  }
  return n;
}

export const pool = mysql.createPool({
  host: requiredEnv('DB_HOST'),
  port: toPort(process.env.DB_PORT),
  user: requiredEnv('DB_USER'),
  password: process.env.DB_PASSWORD ?? '',
  database: requiredEnv('DB_NAME'),
  connectionLimit: toConnectionLimit(process.env.DB_CONNECTION_LIMIT),
  waitForConnections: true,
  charset: 'utf8mb4',
  supportBigNumbers: true,
});

export const db = drizzle({ client: pool, schema, mode: 'default' });

export async function closeDb(): Promise<void> {
  try {
    await pool.end();
  } catch {
  }
}
