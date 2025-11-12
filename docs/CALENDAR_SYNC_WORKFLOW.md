# Calendar Sync Workflow Documentation

## Overview

The calendar sync workflow automatically creates snipe targets from MEXC calendar listings. This ensures targets are ready for auto-sniping execution.

## Components

### 1. Calendar Sync Service
- **Location**: `src/services/calendar-to-database-sync.ts`
- **Purpose**: Fetches calendar data from MEXC API and creates snipe targets in the database
- **Features**:
  - Filters qualifying launches (within time window, minimum 48 hours)
  - Creates targets with status "active" for upcoming launches
  - Updates existing targets with new information
  - Cleans up old/stale targets

### 2. Inngest Workflow
- **Scheduled Function**: Runs every 30 minutes (`src/inngest/scheduled-functions.ts`)
- **Event Function**: `pollMexcCalendar` handles `mexc/calendar.poll` events
- **API Endpoint**: `/api/inngest` (handles Inngest webhooks)

### 3. API Endpoints

#### Calendar Sync API
- **POST** `/api/sync/calendar-to-database`
  - Body: `{ userId?, timeWindowHours?, forceSync?, dryRun? }`
  - Triggers calendar sync manually

#### Snipe Targets API
- **GET** `/api/snipe-targets?status=ready&includeSystem=true`
  - Returns snipe targets filtered by status

## Scripts

### Check Next Target
```bash
# Check for next target (requires targets to exist)
bun run scripts/check-next-target.ts
# or
npm run check-target

# Sync calendar first, then check
bun run scripts/check-next-target.ts --sync
# or
npm run check-target:sync
```

### Sync Calendar
```bash
# Sync calendar for upcoming hour
bun run scripts/sync-calendar-for-hour.ts
# or
npm run sync-calendar

# Sync and check targets
bun run scripts/sync-and-check-targets.ts
# or
npm run check-target:sync
```

## Workflow Flow

1. **Scheduled Trigger** (every 30 minutes)
   - `scheduledCalendarMonitoring` function runs
   - Sends `mexc/calendar.poll` event

2. **Event Processing**
   - `pollMexcCalendar` function receives event
   - Calls `calendarSyncService.syncCalendarToDatabase()`

3. **Calendar Sync**
   - Fetches calendar data from `/api/mexc/calendar`
   - Filters qualifying launches (within 72-hour window)
   - Creates/updates snipe targets in database
   - Sets status to "active" for dashboard visibility

4. **Target Execution**
   - Auto-sniping module queries for "ready" targets
   - Executes targets when execution time arrives
   - Updates status to "executing" → "completed" or "failed"

## Manual Triggering

### Via API
```bash
curl -X POST http://localhost:3008/api/sync/calendar-to-database \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "system",
    "timeWindowHours": 72,
    "forceSync": true
  }'
```

### Via Inngest Event
```typescript
import { inngest } from "@/src/inngest/client";

await inngest.send({
  name: "mexc/calendar.poll",
  data: {
    trigger: "manual",
    force: true,
    timestamp: new Date().toISOString()
  }
});
```

### Via Script
```bash
bun run scripts/sync-calendar-for-hour.ts
```

## Target Status Flow

```
pending → active → ready → executing → completed
                              ↓
                            failed
```

- **pending**: Target created but execution time hasn't arrived
- **active**: Target is visible in dashboard, execution time approaching
- **ready**: Target can be executed (execution time passed or null)
- **executing**: Target is currently being executed
- **completed**: Target executed successfully
- **failed**: Target execution failed or timed out

## Configuration

### Time Windows
- **Default**: 24 hours
- **Minimum**: 48 hours (ensures tomorrow's listings are included)
- **Calendar Sync**: 72 hours (3 days)

### Target Defaults
- **Position Size**: 100 USDT
- **Stop Loss**: 15%
- **Take Profit**: 25% (custom)
- **Confidence Score**: 85% (for calendar launches)
- **Risk Level**: Medium
- **Status**: Active (for dashboard visibility)

## Troubleshooting

### No Targets Found
1. Check if calendar API is accessible: `GET /api/mexc/calendar`
2. Verify database connection: Check `DATABASE_URL` environment variable
3. Trigger manual sync: `npm run check-target:sync`
4. Check Inngest dashboard: `http://localhost:8288` (dev mode)

### Targets Not Executing
1. Check target status: Should be "ready" for execution
2. Verify execution time: Should be in the past or null
3. Check auto-sniping module: Ensure it's running and processing targets
4. Review logs: Check for errors in target execution

### Sync Not Running
1. Verify Inngest is running: `npm run dev:inngest`
2. Check scheduled function: Should run every 30 minutes
3. Verify Inngest configuration: Check `INNGEST_EVENT_KEY` environment variable
4. Check Inngest dashboard for errors

## Monitoring

### Check Sync Status
```bash
curl http://localhost:3008/api/sync/calendar-to-database
```

### View Targets
```bash
# All targets
curl http://localhost:3008/api/snipe-targets

# Ready targets only
curl http://localhost:3008/api/snipe-targets?status=ready

# Active targets
curl http://localhost:3008/api/snipe-targets?status=active
```

### Inngest Dashboard
- **Development**: http://localhost:8288
- **Production**: Check Inngest cloud dashboard

## Next Steps

1. **Start Development Servers**:
   ```bash
   make dev  # Starts Next.js + Inngest
   ```

2. **Check for Targets**:
   ```bash
   npm run check-target:sync
   ```

3. **Monitor Execution**:
   - Watch Inngest dashboard for workflow runs
   - Check database for target status updates
   - Review auto-sniping logs

