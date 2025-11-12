#!/bin/bash
# Get JOBS_CRON_SECRET from Vercel for production cron job configuration

set -e

echo "🔐 Fetching JOBS_CRON_SECRET from Vercel..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "❌ Vercel CLI not found. Install with: bun add -g vercel@latest"
  exit 1
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
  echo "⚠️  Not logged in to Vercel. Please run: vercel login"
  exit 1
fi

# Pull production environment variables
echo "📥 Pulling production environment variables..."
vercel env pull .env.vercel.production --environment=production --yes

# Extract JOBS_CRON_SECRET
if [ -f .env.vercel.production ]; then
  CRON_SECRET=$(grep "^JOBS_CRON_SECRET=" .env.vercel.production | cut -d '=' -f2- | tr -d '"' | tr -d "'")
  
  if [ -z "$CRON_SECRET" ]; then
    echo "⚠️  JOBS_CRON_SECRET not found in Vercel environment variables"
    echo "   Please add it via: vercel env add JOBS_CRON_SECRET production"
    echo "   Or generate one with: openssl rand -base64 32"
    exit 1
  fi
  
  echo ""
  echo "✅ Found JOBS_CRON_SECRET:"
  echo "   $CRON_SECRET"
  echo ""
  echo "📋 Use this value in scripts/setup-cron-jobs.sql"
  echo "   Replace YOUR_CRON_SECRET with the value above"
  echo ""
  echo "🧹 Cleaning up temporary file..."
  rm -f .env.vercel.production
  
else
  echo "❌ Failed to pull environment variables"
  exit 1
fi

