# Setup Vercel Cron Jobs - Quick Guide

## Production URL
✅ **Already configured:** `https://mexc-sniper-bot-nine.vercel.app`

## Step 1: Link Vercel Project (if not already linked)

```bash
cd /Users/cortex-air/Developer/ex/mexc-sniper-bot
vercel link
```

Follow the prompts to select your project.

## Step 2: Get or Create JOBS_CRON_SECRET

### Option A: Check if secret exists in Vercel

```bash
vercel env ls production | grep JOBS_CRON_SECRET
```

### Option B: Create the secret if it doesn't exist

```bash
# Generate a secure secret
openssl rand -base64 32

# Add it to Vercel (replace YOUR_SECRET with the generated value)
vercel env add JOBS_CRON_SECRET production
# Paste the generated secret when prompted
```

### Option C: Use the helper script

```bash
bash scripts/get-cron-secret.sh
```

## Step 3: Update Cron Jobs SQL

1. Get your `JOBS_CRON_SECRET` value (from Step 2)
2. Open `scripts/setup-cron-jobs-production.sql`
3. Replace all 3 occurrences of `YOUR_CRON_SECRET` with your actual secret
4. Copy the entire SQL script

## Step 4: Execute in Supabase SQL Editor

1. Go to your Supabase Dashboard → SQL Editor
2. Paste the updated SQL script
3. Click "Run" or press Cmd/Ctrl + Enter
4. Verify jobs are scheduled:

```sql
SELECT * FROM cron.job;
```

You should see 3 jobs:
- `calendar-sync-cron` (every 30 minutes)
- `risk-check-cron` (every 5 minutes)
- `housekeeping-cron` (daily at 3 AM UTC)

## Step 5: Verify Jobs Are Running

Check job execution history:

```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

## Troubleshooting

### If jobs fail to execute:
1. Check the `cron.job_run_details` table for error messages
2. Verify the API endpoint is accessible:
   ```bash
   curl -X POST https://mexc-sniper-bot-nine.vercel.app/api/jobs/cron \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_CRON_SECRET" \
     -d '{"jobs":[]}'
   ```
3. Verify `JOBS_CRON_SECRET` matches in both Vercel and Supabase SQL

### If Vercel CLI is not linked:
```bash
vercel login
vercel link
# Select your project when prompted
```

