#!/usr/bin/env node

// Apply the missing jobs table migration to the test database
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load test environment
config({ path: '.env.test' });

const migrationSQL = readFileSync(
  resolve('./src/db/migrations/0006_job_queue.sql'),
  'utf-8'
);

async function applyMigration() {
  console.log('Applying jobs table migration to test database...');
  
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  try {
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    
    console.log('Running migration SQL...');
    await sql.unsafe(migrationSQL);
    
    console.log('Migration applied successfully!');
    
    // Verify table was created
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs'
      );
    `;
    
    const exists = result[0].exists;
    console.log('Jobs table exists:', exists);
    
    await sql.end();
    process.exit(exists ? 0 : 1);
  } catch (error) {
    console.error('Error applying migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
