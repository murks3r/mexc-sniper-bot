/**
 * Empty module stub for excluding server-only dependencies from client bundles
 * Used by Turbopack resolveAlias configuration to prevent server modules
 * from being bundled in browser code.
 * 
 * This module exports an empty object to satisfy module resolution while
 * preventing actual server-side code from being included in client bundles.
 */
module.exports = {};

