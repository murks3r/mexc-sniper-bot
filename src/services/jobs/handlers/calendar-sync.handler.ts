import { calendarSyncService } from "@/src/services/calendar-to-database-sync";

export async function handleCalendarSyncJob(payload?: {
  userId?: string;
  timeWindowHours?: number;
  forceSync?: boolean;
}) {
  const userId = payload?.userId ?? "system";
  const timeWindowHours = payload?.timeWindowHours ?? 72;
  const forceSync = payload?.forceSync ?? false;

  return calendarSyncService.syncCalendarToDatabase(userId, {
    timeWindowHours,
    forceSync,
    dryRun: false,
  });
}
