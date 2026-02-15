/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js before any other server-side
 * code runs. It is the ideal place to bootstrap runtime configuration from
 * AWS SSM Parameter Store.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (Node.js runtime), never in Edge or browser
  if (typeof window !== "undefined") return;

  const { isSsmEnabled, loadConfig } = await import("@/lib/vault");

  if (isSsmEnabled()) {
    try {
      console.log("🔐 Lade Konfiguration aus AWS SSM Parameter Store …");
      await loadConfig();
    } catch (error) {
      console.error("❌ Fehler beim Laden der SSM Parameter:", error);

      // In production: abort startup so the container restarts
      if (process.env.NODE_ENV === "production") {
        process.exit(1);
      }

      // In dev: warn but continue (uses local .env fallback)
      console.warn(
        "⚠️  Fallback auf lokale .env-Dateien. " +
          "Setze SSM_CONFIG_ENABLED=false um diese Warnung zu unterdrücken.",
      );
    }
  }
}
