#!/usr/bin/env node

// Simple script to check if jobs table exists in the database
import { config } from 'dotenv';
import postgres from 'postgres';

// Load test environment
config({ path: '.env.test' });

async function checkDatabase() {
  console.log('Checking database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  try {
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    
    // Check if jobs table exists
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'jobs'
      );
    `;
    
    const exists = result[0].exists;
    console.log('Jobs table exists:', exists);
    
    if (exists) {
      // Get table structure
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'jobs'
        ORDER BY ordinal_position;
      `;
      
      console.log('\nTable structure:');
      columns.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type}`);
      });
    }
    
    await sql.end();
    process.exit(exists ? 0 : 1);
  } catch (error) {
    console.error('Error checking database:', error.message);
    process.exit(1);
  }
}

checkDatabase();
