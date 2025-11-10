import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/supabase-auth";
import { getUserCredentials } from "@/src/services/api/user-credentials-service";
import { getGlobalHealthMonitor } from "@/src/services/data/connection-health-monitor";

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache window

interface ConnectivityCheckResult {
  connected: boolean;
  message: string;
  error?: string;
  latency: number;
  timestamp: string;
}

interface ConnectivityAlertSummary {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  metrics: Record<string, number>;
}

interface ConnectivityMetrics {
  totalChecks: number;
  successRate: number;
  averageLatency: number;
  uptime: number;
  consecutiveFailures: number;
  qualityScore: number;
  lastCheckTime?: string;
}

type CredentialSource = "database" | "environment" | "none";

interface ConnectivityResponse {
  connected: boolean;
  hasCredentials: boolean;
  hasUserCredentials: boolean;
  hasEnvironmentCredentials: boolean;
  credentialsValid: boolean;
  credentialSource: CredentialSource;
  message: string;
  timestamp: string;
  status: "fully_connected" | "no_credentials" | "invalid_credentials" | "network_error" | "error";
  error?: string;
  retryCount: number;
  latency: number;
  lastSuccessfulCheck?: string;
  connectionHealth: "excellent" | "good" | "fair" | "poor";
  metrics: ConnectivityMetrics;
  alerts: {
    count: number;
    items: ConnectivityAlertSummary[];
  };
}

let connectivityCache: { data: ConnectivityCheckResult; timestamp: number } | null = null;

async function checkMexcConnectivityFast(): Promise<ConnectivityCheckResult> {
  const now = Date.now();
  if (connectivityCache && now - connectivityCache.timestamp < CACHE_DURATION) {
    return connectivityCache.data;
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("https://api.mexc.com/api/v3/ping", {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const payload: ConnectivityCheckResult = {
      connected: response.ok,
      message: response.ok ? "MEXC API is reachable" : "MEXC API returned an unexpected response",
      latency: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    if (!response.ok) {
      payload.error = `HTTP ${response.status}: ${response.statusText}`;
    }

    if (response.ok) {
      connectivityCache = { data: payload, timestamp: now };
    }

    return payload;
  } catch (error) {
    clearTimeout(timeoutId);

    const payload: ConnectivityCheckResult = {
      connected: false,
      message: error instanceof Error ? error.message : "Connectivity check failed",
      error: error instanceof Error ? error.message : "Connectivity check failed",
      latency: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    return payload;
  }
}

function deriveStatus(
  connected: boolean,
  credentialsValid: boolean,
  hasCredentials: boolean,
): ConnectivityResponse["status"] {
  if (!hasCredentials) {
    return "no_credentials";
  }
  if (connected && credentialsValid) {
    return "fully_connected";
  }
  if (connected && !credentialsValid) {
    return "invalid_credentials";
  }
  return "network_error";
}

async function buildConnectivityResponse(): Promise<ConnectivityResponse> {
  const healthMonitor = getGlobalHealthMonitor();

  if (!healthMonitor.getStatus().isMonitoring) {
    healthMonitor.start();
  }

  const connectivity = await checkMexcConnectivityFast();

  let userId: string | null = null;
  try {
    const user = await requireAuth();
    userId = user?.id ?? null;
  } catch (_error) {
    userId = null;
  }

  let userCredentials = null;
  let hasUserCredentials = false;
  let credentialSource: CredentialSource = "none";

  if (userId) {
    try {
      userCredentials = await getUserCredentials(userId, "mexc");
      hasUserCredentials = !!userCredentials;
      if (hasUserCredentials) {
        credentialSource = "database";
      }
    } catch (_error) {
      // Ignore credential retrieval failures
    }
  }

  const hasEnvironmentCredentials = !!(process.env.MEXC_API_KEY && process.env.MEXC_SECRET_KEY);
  const hasCredentials = hasUserCredentials || hasEnvironmentCredentials;

  if (!hasUserCredentials && hasEnvironmentCredentials) {
    credentialSource = "environment";
  }

  const credentialsValid = hasCredentials;
  const connectionQuality = healthMonitor.getConnectionQuality();
  const healthMetrics = healthMonitor.getHealthMetrics();
  const recentAlerts = healthMonitor.getRecentAlerts(24);

  const metrics: ConnectivityMetrics = {
    totalChecks: healthMetrics.totalChecks,
    successRate: Number(healthMetrics.successRate),
    averageLatency: healthMetrics.averageLatency,
    uptime: healthMetrics.uptime,
    consecutiveFailures: healthMetrics.consecutiveFailures,
    qualityScore: connectionQuality.score,
    lastCheckTime: healthMetrics.lastCheckTime?.toISOString(),
  };

  const alerts = recentAlerts.map((alert) => ({
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    timestamp: alert.timestamp.toISOString(),
    metrics: alert.metrics,
  }));

  return {
    connected: connectivity.connected,
    hasCredentials,
    hasUserCredentials,
    hasEnvironmentCredentials,
    credentialsValid,
    credentialSource,
    message: connectivity.message,
    timestamp: connectivity.timestamp,
    status: deriveStatus(connectivity.connected, credentialsValid, hasCredentials),
    error: connectivity.error,
    retryCount: 0,
    latency: connectivity.latency,
    lastSuccessfulCheck: healthMetrics.lastCheckTime?.toISOString(),
    connectionHealth: connectionQuality.status,
    metrics,
    alerts: {
      count: alerts.length,
      items: alerts,
    },
  };
}

export async function GET() {
  try {
    const result = await buildConnectivityResponse();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        hasCredentials: false,
        hasUserCredentials: false,
        hasEnvironmentCredentials: false,
        credentialsValid: false,
        credentialSource: "none",
        message: error instanceof Error ? error.message : "Connectivity check failed",
        timestamp: new Date().toISOString(),
        status: "network_error",
        error: error instanceof Error ? error.message : "Connectivity check failed",
        retryCount: 0,
        latency: 0,
        connectionHealth: "poor",
        metrics: {
          totalChecks: 0,
          successRate: 0,
          averageLatency: 0,
          uptime: 0,
          consecutiveFailures: 0,
          qualityScore: 0,
        },
        alerts: { count: 0, items: [] },
      },
      { status: 500 },
    );
  }
}
