import { describe, it, expect, vi } from "vitest";
import { GET } from "./route";

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data) => ({
      status: 200,
      data,
    })),
  },
}));

describe("GET /api/health/quick", () => {
  it("should return healthy status with all components", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      status: "healthy",
      message: "All systems operational",
      components: {
        database: { status: "healthy", message: "Database connection healthy" },
        mexcApi: { status: "healthy", message: "MEXC API connectivity good" },
        environment: { status: "healthy", message: "Environment configured" },
        workflows: { status: "healthy", message: "Workflow system operational" },
      },
    });
  });

  it("should include a timestamp", async () => {
    const before = new Date();
    const response = await GET();
    const after = new Date();

    expect(response.data.timestamp).toBeDefined();
    const timestamp = new Date(response.data.timestamp);

    // Timestamp should be between before and after (within reasonable bounds)
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it("should return valid ISO timestamp format", async () => {
    const response = await GET();

    // Should be valid ISO string
    expect(() => new Date(response.data.timestamp)).not.toThrow();
    expect(response.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
