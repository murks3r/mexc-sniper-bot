/**
 * Alerts Schema
 *
 * Database schema for alerts and notifications.
 */

import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
});

export const notificationChannels = pgTable("notification_channels", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").default(true),
  config: jsonb("config"),
  headers: jsonb("headers"),
  severityFilter: text("severity_filter"),
  categoryFilter: text("category_filter"),
  tagFilter: text("tag_filter"),
  isEnabled: boolean("is_enabled").default(true),
  isDefault: boolean("is_default").default(false),
  rateLimitPerHour: integer("rate_limit_per_hour").default(100),
  messageTemplate: text("message_template"),
  titleTemplate: text("title_template"),
  credentials: jsonb("credentials"),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by").notNull(),
});

export type SelectAlert = typeof alerts.$inferSelect;
export type SelectNotificationChannel = typeof notificationChannels.$inferSelect;
export type SelectAlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = typeof alertRules.$inferInsert;

// Stub exports for missing schema tables
export const anomalyModels = pgTable("anomaly_models", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertAnalytics = pgTable("alert_analytics", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertNotifications = pgTable("alert_notifications", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertCorrelations = pgTable("alert_correlations", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertSuppressions = pgTable("alert_suppressions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  metricName: text("metric_name").notNull(),
  operator: text("operator").notNull(),
  threshold: jsonb("threshold"),
  aggregationWindow: integer("aggregation_window"),
  evaluationInterval: integer("evaluation_interval"),
  useAnomalyDetection: boolean("use_anomaly_detection").default(false),
  anomalyThreshold: jsonb("anomaly_threshold"),
  learningWindow: integer("learning_window"),
  suppressionDuration: integer("suppression_duration"),
  escalationDelay: integer("escalation_delay"),
  maxAlerts: integer("max_alerts"),
  correlationKey: text("correlation_key"),
  parentRuleId: text("parent_rule_id"),
  tags: jsonb("tags"),
  customFields: jsonb("custom_fields"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const alertInstances = pgTable("alert_instances", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const escalationPolicies = pgTable("escalation_policies", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});
