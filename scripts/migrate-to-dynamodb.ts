#!/usr/bin/env ts-node

/**
 * PostgreSQL → DynamoDB Data Migration Script
 * Migriere alle Daten von bestehender PostgreSQL zu DynamoDB
 */

import * as AWS from 'aws-sdk';
import { Pool } from 'pg';

interface MigrationConfig {
  pgHost: string;
  pgPort: number;
  pgDatabase: string;
  pgUser: string;
  pgPassword: string;
  awsRegion: string;
  dynamoTableName: string;
}

class DataMigration {
  private pgPool: Pool;
  private dynamoDb: AWS.DynamoDB;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    
    this.pgPool = new Pool({
      host: config.pgHost,
      port: config.pgPort,
      database: config.pgDatabase,
      user: config.pgUser,
      password: config.pgPassword,
    });

    this.dynamoDb = new AWS.DynamoDB({
      region: config.awsRegion,
    });
  }

  /**
   * Migriere Orders von PostgreSQL zu DynamoDB
   */
  async migrateOrders(): Promise<void> {
    console.log('[Migration] Starting orders migration...');

    const query = `
      SELECT 
        id, user_id, symbol, side, order_type, quantity, price, 
        filled_qty, status, mexc_order_id, error_message, 
        created_at, updated_at
      FROM orders
      ORDER BY created_at DESC
    `;

    const result = await this.pgPool.query(query);
    const orders = result.rows;

    console.log(`[Migration] Found ${orders.length} orders to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        const timestamp = new Date(order.created_at).getTime();
        const ttl = Math.floor(new Date(order.created_at).getTime() / 1000) + 7776000; // +90 days

        const params = {
          TableName: this.config.dynamoTableName,
          Item: {
            user_id: { S: order.user_id },
            sk: { S: `ORDER#${timestamp}#${order.id}` },
            order_id: { S: order.id.toString() },
            symbol: { S: order.symbol },
            side: { S: order.side },
            order_type: { S: order.order_type },
            quantity: { N: order.quantity.toString() },
            price: order.price ? { N: order.price.toString() } : { NULL: true },
            filled_qty: { N: order.filled_qty.toString() },
            status: { S: order.status },
            timestamp: { N: timestamp.toString() },
            created_at: { S: order.created_at.toISOString() },
            updated_at: { S: order.updated_at.toISOString() },
            mexc_order_id: order.mexc_order_id ? { S: order.mexc_order_id } : { NULL: true },
            error_message: order.error_message ? { S: order.error_message } : { NULL: true },
            ttl: { N: ttl.toString() },
            data_type: { S: 'ORDER' },
          },
        };

        await this.dynamoDb.putItem(params).promise();
        successCount++;

        if (successCount % 100 === 0) {
          console.log(`[Migration] Migrated ${successCount} orders...`);
        }
      } catch (error) {
        console.error(`[Error] Failed to migrate order ${order.id}:`, error);
        errorCount++;
      }
    }

    console.log(
      `[Migration] Orders migration complete: ${successCount} success, ${errorCount} errors`
    );
  }

  /**
   * Migriere Positions von PostgreSQL zu DynamoDB
   */
  async migratePositions(): Promise<void> {
    console.log('[Migration] Starting positions migration...');

    const query = `
      SELECT 
        id, user_id, symbol, entry_price, current_price, quantity, 
        side, entry_time, pnl, pnl_percentage, status, updated_at
      FROM positions
      ORDER BY entry_time DESC
    `;

    const result = await this.pgPool.query(query);
    const positions = result.rows;

    console.log(`[Migration] Found ${positions.length} positions to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const position of positions) {
      try {
        const entryTime = new Date(position.entry_time).getTime();
        const ttl = Math.floor(new Date(position.entry_time).getTime() / 1000) + 7776000;

        const params = {
          TableName: this.config.dynamoTableName,
          Item: {
            user_id: { S: position.user_id },
            sk: { S: `POSITION#${entryTime}#${position.id}` },
            position_id: { S: position.id.toString() },
            symbol: { S: position.symbol },
            entry_price: { N: position.entry_price.toString() },
            current_price: { N: position.current_price.toString() },
            quantity: { N: position.quantity.toString() },
            side: { S: position.side },
            entry_time: { N: entryTime.toString() },
            pnl: position.pnl ? { N: position.pnl.toString() } : { NULL: true },
            pnl_percentage: position.pnl_percentage
              ? { N: position.pnl_percentage.toString() }
              : { NULL: true },
            status: { S: position.status },
            updated_at: { S: position.updated_at.toISOString() },
            ttl: { N: ttl.toString() },
            data_type: { S: 'POSITION' },
          },
        };

        await this.dynamoDb.putItem(params).promise();
        successCount++;

        if (successCount % 100 === 0) {
          console.log(`[Migration] Migrated ${successCount} positions...`);
        }
      } catch (error) {
        console.error(`[Error] Failed to migrate position ${position.id}:`, error);
        errorCount++;
      }
    }

    console.log(
      `[Migration] Positions migration complete: ${successCount} success, ${errorCount} errors`
    );
  }

  /**
   * Migriere Calendar Events von PostgreSQL zu DynamoDB
   */
  async migrateCalendarEvents(): Promise<void> {
    console.log('[Migration] Starting calendar events migration...');

    const query = `
      SELECT 
        id, user_id, token_name, symbol, launch_time, detected_pattern, 
        confidence, status, execution_time, executed_orders, created_at
      FROM calendar_events
      ORDER BY launch_time DESC
    `;

    const result = await this.pgPool.query(query);
    const events = result.rows;

    console.log(`[Migration] Found ${events.length} calendar events to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const event of events) {
      try {
        const launchTime = event.launch_time;
        const ttl = Math.floor(launchTime / 1000) + 7776000;

        const params = {
          TableName: this.config.dynamoTableName,
          Item: {
            user_id: { S: event.user_id },
            sk: { S: `CALENDAR#${launchTime}#${event.id}` },
            event_id: { S: event.id.toString() },
            token_name: { S: event.token_name },
            symbol: { S: event.symbol },
            launch_time: { N: launchTime.toString() },
            detected_pattern: { S: event.detected_pattern },
            confidence: { N: event.confidence.toString() },
            status: { S: event.status },
            execution_time: event.execution_time
              ? { N: event.execution_time.toString() }
              : { NULL: true },
            executed_orders:
              event.executed_orders && event.executed_orders.length > 0
                ? { SS: event.executed_orders }
                : { NULL: true },
            created_at: { S: event.created_at.toISOString() },
            ttl: { N: ttl.toString() },
            data_type: { S: 'CALENDAR' },
          },
        };

        await this.dynamoDb.putItem(params).promise();
        successCount++;

        if (successCount % 100 === 0) {
          console.log(`[Migration] Migrated ${successCount} events...`);
        }
      } catch (error) {
        console.error(`[Error] Failed to migrate event ${event.id}:`, error);
        errorCount++;
      }
    }

    console.log(
      `[Migration] Calendar events migration complete: ${successCount} success, ${errorCount} errors`
    );
  }

  /**
   * Validiere Migration Konsistenz
   */
  async validateMigration(): Promise<void> {
    console.log('[Validation] Starting data consistency checks...');

    // Query DynamoDB für Counts
    const params = {
      TableName: this.config.dynamoTableName,
      IndexName: 'data_type-index',
      KeyConditionExpression: 'data_type = :dt',
      ExpressionAttributeValues: {
        ':dt': { S: 'ORDER' },
      },
      Select: 'COUNT',
    };

    try {
      const result = await this.dynamoDb.query(params).promise();
      console.log(`[Validation] Orders in DynamoDB: ${result.Count}`);

      // Vergleiche mit PostgreSQL
      const pgResult = await this.pgPool.query('SELECT COUNT(*) FROM orders');
      const pgCount = parseInt(pgResult.rows[0].count, 10);
      console.log(`[Validation] Orders in PostgreSQL: ${pgCount}`);

      if (result.Count === pgCount) {
        console.log('[Validation] ✓ Order count matches!');
      } else {
        console.warn(
          `[Validation] ⚠️ Order count mismatch: DynamoDB=${result.Count}, PostgreSQL=${pgCount}`
        );
      }
    } catch (error) {
      console.error('[Validation] Error during validation:', error);
    }
  }

  /**
   * Führe vollständige Migration durch
   */
  async runFullMigration(): Promise<void> {
    try {
      console.log('[Migration] Starting full data migration...');
      console.log(`[Config] Target DynamoDB Table: ${this.config.dynamoTableName}`);
      console.log(`[Config] AWS Region: ${this.config.awsRegion}`);

      await this.migrateOrders();
      await this.migratePositions();
      await this.migrateCalendarEvents();

      await this.validateMigration();

      console.log('[Migration] ✓ Full migration completed successfully!');
    } catch (error) {
      console.error('[Migration] ✗ Migration failed:', error);
      process.exit(1);
    } finally {
      await this.pgPool.end();
    }
  }
}

// Main execution
async function main() {
  const config: MigrationConfig = {
    pgHost: process.env.PG_HOST || 'localhost',
    pgPort: parseInt(process.env.PG_PORT || '5432', 10),
    pgDatabase: process.env.PG_DATABASE || 'mexc_trading',
    pgUser: process.env.PG_USER || 'postgres',
    pgPassword: process.env.PG_PASSWORD || '',
    awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
    dynamoTableName: process.env.DYNAMODB_TABLE || 'mexc_trading_data',
  };

  const migration = new DataMigration(config);
  await migration.runFullMigration();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
