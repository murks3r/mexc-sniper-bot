/**
 * TestContainers Setup for Database Integration Tests
 * 
 * Provides programmatic PostgreSQL container management with automatic:
 * - Container lifecycle management
 * - Database schema initialization
 * - Connection string generation
 * - Cleanup and isolation
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';

let testDatabase: ReturnType<typeof drizzle> | null = null;
let postgresClient: ReturnType<typeof postgres> | null = null;
let containerInfo: { connectionString: string } | null = null;

/**
 * Start PostgreSQL container and initialize database schema
 */
export async function startTestDatabase(): Promise<{
  database: ReturnType<typeof drizzle>;
  connectionString: string;
}> {
  console.log('Starting TestContainers database...');
  
  try {
    const connectionString = await startDockerContainer();

    postgresClient = postgres(connectionString, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 30,
    });
    
    testDatabase = drizzle(postgresClient);
    
    await initializeDatabaseSchema(postgresClient);

    containerInfo = { connectionString };
    console.log('TestContainers database setup complete');

    return {
      database: testDatabase,
      connectionString,
    };
  } catch (error) {
    console.error('Failed to start TestContainers database:', error);
    throw error;
  }
}

async function startDockerContainer(): Promise<string> {
  const { execSync } = await import('child_process');
  
  try {
    const containerName = `test-postgres-${Date.now()}`;
    const port = Math.floor(Math.random() * 10000) + 20000;
    
    console.log(`Starting Docker container: ${containerName} on port ${port}`);
    
    const dockerCommand = [
      'docker', 'run', '-d', '--name', containerName,
      '-p', `${port}:5432`,
      '-e', 'POSTGRES_DB=test_db',
      '-e', 'POSTGRES_USER=test_user', 
      '-e', 'POSTGRES_PASSWORD=test_password',
      'postgres:15-alpine'
    ].join(' ');
    
    execSync(dockerCommand, { stdio: 'inherit' });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const connectionString = `postgresql://test_user:test_password@localhost:${port}/test_db`;
    
    process.env.TEST_CONTAINER_NAME = containerName;
    
    return connectionString;
  } catch (error) {
    console.error('Failed to start Docker container:', error);
    throw error;
  }
}

/**
 * Initialize database schema using Drizzle migrations
 */
async function initializeDatabaseSchema(client: ReturnType<typeof postgres>): Promise<void> {
  console.log('Initializing database schema with Drizzle migrations...');
  
  try {
    const db = drizzle(client);
    const migrationsFolder = path.join(process.cwd(), 'src/db/migrations');
    
    console.log('Running Drizzle migrations...');
    await migrate(db, { migrationsFolder });
    
    console.log('Database schema initialized successfully');
    
    const tables = await client`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `;
    
    console.log(`Database contains ${tables.length} tables`);
    
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Stop and cleanup TestContainers database
 */
export async function stopTestDatabase(): Promise<void> {
  console.log('Cleaning up TestContainers database...');
  
  try {
    if (postgresClient) {
      await postgresClient.end();
      postgresClient = null;
      testDatabase = null;
    }

    if (process.env.TEST_CONTAINER_NAME) {
      const { execSync } = await import('child_process');
      try {
        execSync(`docker stop ${process.env.TEST_CONTAINER_NAME}`, { stdio: 'inherit' });
        execSync(`docker rm ${process.env.TEST_CONTAINER_NAME}`, { stdio: 'inherit' });
        console.log('Docker container stopped and removed');
      } catch (error) {
        console.error('Warning: Failed to clean up Docker container:', error);
      }
      delete process.env.TEST_CONTAINER_NAME;
    }
    
    containerInfo = null;
  } catch (error) {
    console.error('Cleanup warning:', error);
  }
}

/**
 * Get the current test database instance
 */
export function getTestDatabase(): ReturnType<typeof drizzle> {
  if (!testDatabase) {
    throw new Error('Test database not initialized. Call startTestDatabase() first.');
  }
  return testDatabase;
}

/**
 * Get a fresh database connection string for the current container
 */
export function getTestConnectionString(): string {
  if (!containerInfo) {
    throw new Error('Test database not started. Call startTestDatabase() first.');
  }
  return containerInfo.connectionString;
}

/**
 * Reset test database by truncating all tables
 */
export async function resetTestDatabase(): Promise<void> {
  if (!testDatabase || !postgresClient) {
    throw new Error('Test database not initialized');
  }

  console.log('Resetting test database...');
  
  try {
    const tables = await postgresClient`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;

    for (const table of tables) {
      await postgresClient`TRUNCATE TABLE ${postgresClient(table.tablename)} CASCADE`;
    }
    
    console.log(`Reset ${tables.length} tables`);
  } catch (error) {
    console.error('Failed to reset test database:', error);
    throw error;
  }
} 