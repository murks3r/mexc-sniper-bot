#!/bin/bash
# Integration Test Runner
# Runs all tests including integration tests against real Supabase

set -e

echo "🧪 Running integration tests with real Supabase..."
echo ""

# Load test environment
if [ -f .env.test ]; then
  export $(cat .env.test | grep -v '^#' | xargs)
fi

# Run tests
npm test

echo ""
echo "✅ Integration tests complete!"
