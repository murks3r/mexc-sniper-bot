# Chrome DevTools Verification Guide

This guide helps you verify that the token launch discovery pipeline fixes are working correctly using Chrome DevTools.

## Prerequisites

1. Start the development server:
   ```bash
   bun run dev
   ```

2. Open Chrome and navigate to: `http://localhost:3008/dashboard`

3. Open Chrome DevTools:
   - Press `F12` (Windows/Linux) or `Cmd+Option+I` (Mac)
   - Or right-click → Inspect

## Verification Steps

### 1. Network Tab - Calendar API Request

**What to Check:**
- Open the **Network** tab in DevTools
- Filter by "calendar" or look for `/api/mexc/calendar`
- Click on the request to see details

**Expected Results:**

✅ **Success Case:**
```
Status: 200 OK
Response Headers:
  Content-Type: application/json
Response Body:
{
  "success": true,
  "data": [...],  // Array of calendar entries
  "meta": {
    "count": 10,
    "timestamp": "..."
  }
}
```

✅ **Error Case (Proper Error Handling):**
```
Status: 503 Service Unavailable
Response Body:
{
  "success": false,
  "error": "Service temporarily unavailable",
  "meta": {
    "count": 0,
    "fallback": true
  }
}
```

❌ **Old Behavior (Should NOT see):**
```
Status: 200 OK
Response Body:
{
  "success": true,
  "data": [],  // Empty array masking error
  "meta": {
    "error": "Service temporarily unavailable",
    "fallback": true
  }
}
```

### 2. Network Tab - Snipe Targets API Request

**What to Check:**
- Look for `/api/snipe-targets?status=active&includeSystem=true`
- Check the response includes targets with `status: "ready"`

**Expected Results:**

✅ **Should Include Ready Targets:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "vcoinId": "...",
      "symbolName": "TOKEN",
      "status": "ready",  // ✅ Ready targets included
      ...
    },
    {
      "status": "active",  // ✅ Active targets included
      ...
    }
  ],
  "count": 5
}
```

### 3. Console Tab - Logging Verification

**What to Check:**
- Open the **Console** tab
- Look for log messages

**Expected Results:**

✅ **Good (Structured Logging):**
```
[INFO] [use-pattern-sniper] New listing detected {"symbol":"TOKEN","vcoinId":"...","launchTime":"..."}
[INFO] [use-pattern-sniper] Ready state detected {"symbol":"TOKEN","pattern":"sts:2, st:2, tt:4"}
[INFO] [use-pattern-sniper] Pattern Sniper started (Auto-Snipe Active)
```

❌ **Bad (Should NOT see):**
```
console.log("🚀 EXECUTING SNIPE: TOKEN")
console.info("📅 New listing detected: TOKEN")
console.error("❌ Invalid trading target")
```

**Note:** Some console.log from libraries is OK, but our code should use the logger.

### 4. Console Tab - Error Verification

**What to Check:**
- Look for red error messages
- Check if errors are properly displayed

**Expected Results:**

✅ **Proper Error Display:**
- Errors are visible in the UI (not hidden)
- Error messages are clear and actionable
- No uncaught exceptions

❌ **Bad (Should NOT see):**
- Silent failures (no error messages)
- Empty states when errors occur
- Uncaught promise rejections

### 5. Application Tab - Local Storage

**What to Check:**
- Open **Application** tab → **Local Storage** → `http://localhost:3008`
- Look for `pattern-sniper-monitoring`

**Expected Results:**

✅ **Should See:**
```
pattern-sniper-monitoring: "true"  or  "false"
```

This indicates the monitoring state is being persisted.

### 6. Elements Tab - UI Verification

**What to Check:**
- Inspect the dashboard page
- Look for error messages, loading states, and target displays

**Expected Results:**

✅ **Error State (When API Fails):**
```html
<div class="border-red-500/20 bg-red-500/10">
  <h3>System Status</h3>
  <p>Calendar API Error: Service temporarily unavailable</p>
</div>
```

✅ **Loading State:**
```html
<p>Loading calendar data...</p>
```

✅ **Empty State (No Listings):**
```html
<p>No calendar listings found. This may be normal if there are no upcoming launches.</p>
```

✅ **Targets Displayed:**
- Coin listing cards visible
- Status badges showing (Ready, Active, Monitoring, etc.)
- Target counts in stats overview

### 7. Performance Tab (Optional)

**What to Check:**
- Open **Performance** tab
- Record a session while navigating the dashboard
- Check for:
  - Excessive re-renders
  - Long-running tasks
  - Memory leaks

**Expected Results:**

✅ **Good Performance:**
- Smooth rendering
- No excessive re-renders
- Memory usage stable

## Quick Verification Checklist

Use this checklist to quickly verify all fixes:

- [ ] Calendar API returns proper error responses (not empty arrays)
- [ ] Snipe targets API includes 'ready' status when querying 'active'
- [ ] No excessive console.log statements (logger used instead)
- [ ] Error messages are visible in UI (not hidden)
- [ ] Loading states work correctly
- [ ] Targets appear in dashboard when available
- [ ] Network requests have proper status codes
- [ ] No uncaught exceptions in console

## Troubleshooting

### If Calendar API Returns 403:

This is expected if MEXC is blocking requests. The important thing is:
- ✅ Error is properly returned (not masked)
- ✅ Frontend shows error message
- ✅ System doesn't crash

### If No Targets Appear:

1. Check database has targets:
   ```bash
   bun run scripts/verify-discovery-pipeline.ts
   ```

2. Check API response includes targets:
   - Network tab → `/api/snipe-targets?status=active&includeSystem=true`
   - Verify response has `data` array with targets

3. Check frontend filtering:
   - Elements tab → Inspect coin listings board
   - Check if targets are filtered out by date range

### If Console Shows Errors:

1. Check if errors are from our code or libraries
2. Verify logger is being used (not console.log)
3. Check error messages are helpful and actionable

## Success Criteria

✅ **All fixes verified when:**
1. Error handling works (errors visible, not masked)
2. Status query includes 'ready' targets
3. Logger used instead of console.log
4. Targets appear when available
5. No critical console errors
6. Network requests have proper status codes

## Next Steps After Verification

1. If all checks pass: ✅ Fixes are working correctly
2. If some checks fail: Review the specific issue and check the implementation
3. Monitor in production: Watch for errors and verify targets appear

