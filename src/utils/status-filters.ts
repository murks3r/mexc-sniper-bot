/**
 * Status Filtering Utilities
 *
 * Shared utilities for filtering targets by status
 * Eliminates duplication across API routes and components
 */

/**
 * Check if a status should be included when querying for "active" status
 */
export function isActiveStatus(status: string): boolean {
  return ["active", "executing", "ready"].includes(status);
}

/**
 * Filter targets by status, with special handling for "active" query
 */
export function filterTargetsByStatus<T extends { status?: string }>(
  targets: T[],
  queryStatus?: string | null,
): T[] {
  if (!queryStatus) return targets;

  if (queryStatus === "active") {
    // Include active, executing, and ready when querying for "active"
    return targets.filter((target) => isActiveStatus(target.status || ""));
  }

  // Exact match for other statuses
  return targets.filter((target) => target.status === queryStatus);
}

/**
 * Get status counts for a collection of targets
 */
export function getStatusCounts<T extends { status?: string }>(
  targets: T[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const target of targets) {
    const status = target.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}
