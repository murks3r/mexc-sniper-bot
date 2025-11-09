import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Force PostgreSQL usage - no SQLite fallback
// Support both postgresql:// (NeonDB) and postgres:// (Supabase) protocols
const hasPostgresConfig = 
  process.env.DATABASE_URL?.startsWith('postgresql://') ||
  process.env.DATABASE_URL?.startsWith('postgres://');

if (!hasPostgresConfig) {
  throw new Error('DATABASE_URL must be configured with a PostgreSQL connection string (postgresql:// or postgres://)');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  // PostgreSQL specific optimizations
  tablesFilter: ['!pg_*', '!information_schema*'],
  breakpoints: true,
});