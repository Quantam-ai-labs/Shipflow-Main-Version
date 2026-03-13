import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  min: 2,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: 30000,
  query_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

export const db = drizzle(pool, { schema });

const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  '57P01', '57P03', '08006', '08001', '08003', '08004',
  'CONNECTION_ERROR',
]);

const RETRYABLE_MESSAGES = [
  'Connection terminated',
  'connection timeout',
  'timeout expired',
  'terminating connection',
  'server closed the connection',
  'remaining connection slots are reserved',
  'too many connections',
  'cannot acquire a connection',
  'idle timeout',
];

function isRetryableError(err: any): boolean {
  if (!err) return false;
  if (RETRYABLE_CODES.has(err.code)) return true;
  const msg = (err.message || '').toLowerCase();
  return RETRYABLE_MESSAGES.some(m => msg.includes(m.toLowerCase()));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string = 'db-operation',
  maxRetries: number = 2,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const backoff = delayMs * Math.pow(2, attempt);
        console.warn(`[DB Retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}. Retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
