# Database Migration Instructions

## New Table: mexc_symbols

This migration adds the `mexc_symbols` table for caching MEXC trading rules.

### Schema Location
- **Schema File**: `/src/db/schemas/mexc-symbols.ts`
- **Exported in**: `/src/db/schema.ts`

### Purpose
Implements **Slice 1.3** from the optimization plan: Database Verrijking (Enrichment).

The table caches trading rules from MEXC's `exchangeInfo` API to enable:
1. **Assessment Zone Blocking** (prevents error 10007)
2. **Precision Validation** (prevents error 30002)
3. **Fast local validation** (no API calls during snipe execution)

### To Generate and Run Migration

```bash
# 1. Ensure DATABASE_URL is set in .env.local
# 2. Generate the migration
npm run db:generate

# 3. Push to database
npm run db:push

# OR run migration manually
npm run db:migrate
```

### Fields in mexc_symbols Table

| Field | Type | Purpose |
|-------|------|---------|
| `symbol` | TEXT (PK) | Trading pair symbol (e.g., "NEWTOKENUSDT") |
| `is_api_tradable` | BOOLEAN | **Critical**: Filter Assessment Zone tokens |
| `is_spot_trading_allowed` | BOOLEAN | From exchangeInfo response |
| `base_asset_precision` | INTEGER | Decimals for quantity formatting |
| `quote_precision` | INTEGER | Decimals for price formatting |
| `base_size_precision` | DECIMAL | Minimum order quantity |
| `quote_amount_precision` | DECIMAL | Minimum notional value (LIMIT) |
| `quote_amount_precision_market` | DECIMAL | Minimum notional value (MARKET) |

### Related Code Changes

1. **Symbol Qualification Service** (`/src/services/symbol-qualification.service.ts`)
   - Calls `GET /api/v3/exchangeInfo` for each symbol
   - Checks `isSpotTradingAllowed` flag
   - Caches full trading rules in database

2. **Calendar Sync Integration** (`/src/services/calendar-to-database-sync.ts`)
   - Now qualifies symbols BEFORE creating snipe targets
   - Skips Assessment Zone tokens automatically

3. **Precision Utility** (`/src/lib/precision-util.ts`)
   - Reads rules from `mexc_symbols` table
   - Validates and formats order parameters
   - Prevents precision errors (30002)

### Verification

After migration, verify the table exists:

```sql
SELECT * FROM mexc_symbols LIMIT 5;
```

### Rollback (if needed)

If you need to rollback:

```sql
DROP TABLE IF EXISTS mexc_symbols;
```
