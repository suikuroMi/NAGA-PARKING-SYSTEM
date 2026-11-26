import { Pool, type PoolConfig } from 'pg';

export function dbConfig(connectionString = process.env.DATABASE_URL): PoolConfig {
  let ssl: PoolConfig['ssl'] = undefined;
  if (process.env.DATABASE_SSL === 'true') {
    ssl = { rejectUnauthorized: false };
  } else if (process.env.DATABASE_SSL !== 'false' && connectionString) {
    try {
      const u = new URL(connectionString);
      const isExternalCloud = /\.(render\.com|neon\.tech|supabase\.co|railway\.app|aivencloud\.com)$/i.test(u.hostname);
      const sslMode = u.searchParams.get('sslmode');
      if (isExternalCloud || (sslMode && sslMode !== 'disable')) {
        ssl = { rejectUnauthorized: false };
      }
    } catch {
      // Invalid URLs are handled by caller validation
    }
  }
  return {
    connectionString,
    ...(ssl ? { ssl } : {}),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

export const pool = new Pool(dbConfig());

pool.on('error', (err) => {
  console.error('Idle PostgreSQL connection unavailable:', err.message);
});
