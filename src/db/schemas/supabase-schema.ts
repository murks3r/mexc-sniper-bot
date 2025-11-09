// ===========================================
// SUPABASE SCHEMA EXPORTS
// ===========================================

export * from "./alerts";
// Re-export other schemas that are compatible as-is
// Note: workflows excluded to avoid conflicts with supabase-auth
export * from "./patterns";
export * from "./performance";
export * from "./safety";
export * from "./strategies";
export * from "./trading";
// Export Supabase auth schemas with selective exports to avoid conflicts
export {
  type NewSnipeTarget,
  type NewUser,
  type NewUserPreferences,
  type NewUserRole,
  type NewWorkflowActivity,
  type NewWorkflowSystemStatus,
  type SnipeTarget,
  snipeTargets,
  // Exclude coinActivities from supabase-auth as patterns.ts has the comprehensive version
  // Types
  type User,
  type UserPreferences,
  type UserRole,
  userPreferences,
  userRoles,
  users,
  type WorkflowActivity,
  type WorkflowSystemStatus,
  workflowActivity,
  workflowSystemStatus,
  // Exclude CoinActivity and NewCoinActivity types as patterns.ts has the comprehensive version
} from "./supabase-auth";

import * as alerts from "./alerts";
import * as patterns from "./patterns";
import * as performance from "./performance";
import * as safety from "./safety";
import * as strategies from "./strategies";
import * as trading from "./trading";
import {
  snipeTargets,
  userPreferences,
  userRoles,
  users,
  workflowActivity,
  workflowSystemStatus,
} from "./supabase-auth";
// Schema aggregation for Drizzle ORM

export const supabaseSchema = {
  // Selective supabase-auth exports (excluding conflicting coinActivities)
  users,
  userRoles,
  workflowSystemStatus,
  workflowActivity,
  snipeTargets,
  userPreferences,
  // All other schemas
  ...patterns,
  ...strategies,
  ...performance,
  ...alerts,
  ...safety,
  ...trading,
};

export default supabaseSchema;
