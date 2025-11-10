// Build-safe dynamic imports to prevent SSR issues during Next.js build
import { serve } from "inngest/next";

// Use dynamic imports to prevent build-time evaluation issues
async function getInngestSetup() {
  try {
    // Dynamic imports to avoid build-time module evaluation
    const { inngest } = await import("@/src/inngest/client");
    const { pollMexcCalendar } = await import("@/src/inngest/functions");
    const { scheduledCalendarMonitoring } = await import("@/src/inngest/scheduled-functions");

    return {
      client: inngest,
      functions: [
        // Core workflow functions (simplified - no agents)
        pollMexcCalendar, // Calendar sync to database

        // Scheduled monitoring functions (minimized)
        scheduledCalendarMonitoring, // Every 30 minutes - essential for auto-sniping
        // Removed: scheduledHealthCheck, scheduledDailyReport, emergencyResponseHandler
        // Removed: scheduledPatternAnalysis, scheduledIntensiveAnalysis (agent-based)
      ],
    };
  } catch (_error) {
    // Fallback for build-time safety - error logging handled by error handler middleware
    return null;
  }
}

// Build-safe inngest handler
// biome-ignore lint/suspicious/noExplicitAny: Lazy-loaded handler for build safety
let inngestHandler: any = null;

// Only initialize during runtime, not build time
if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
  // This will be initialized on first request
  getInngestSetup()
    .then((setup) => {
      if (setup) {
        inngestHandler = serve(setup);
      }
    })
    .catch((_error) => {
      // Failed to initialize inngest handler - error logging handled by error handler middleware
    });
}

// Export request handlers with build-time safety
export async function GET(request: Request) {
  if (!inngestHandler) {
    const setup = await getInngestSetup();
    if (!setup) {
      return new Response("Inngest not available", { status: 503 });
    }
    inngestHandler = serve(setup);
  }
  return inngestHandler.GET(request);
}

export async function POST(request: Request) {
  if (!inngestHandler) {
    const setup = await getInngestSetup();
    if (!setup) {
      return new Response("Inngest not available", { status: 503 });
    }
    inngestHandler = serve(setup);
  }
  return inngestHandler.POST(request);
}

export async function PUT(request: Request) {
  if (!inngestHandler) {
    const setup = await getInngestSetup();
    if (!setup) {
      return new Response("Inngest not available", { status: 503 });
    }
    inngestHandler = serve(setup);
  }
  return inngestHandler.PUT(request);
}
