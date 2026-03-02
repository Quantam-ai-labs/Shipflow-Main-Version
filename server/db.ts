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
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
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
  maxRetries: number = 1,
  delayMs: number = 500,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        console.warn(`[DB Retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
