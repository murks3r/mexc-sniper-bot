#!/usr/bin/env bun
/**
 * Sync Calendar and Check Targets Script
 *
 * Convenience script that:
 * 1. Syncs calendar data to create snipe targets
 * 2. Displays the next target to snipe
 * 3. Shows summary statistics
 *
 * Usage:
 *   bun run scripts/sync-and-check-targets.ts
 */

// Simply re-export the check-next-target script with sync flag
// This is a convenience wrapper
process.argv.push("--sync");

// Import and run the main check script
await import("./check-next-target.ts");

