import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health/quick", () => {
  it("should return healthy status with all components", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
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
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    const timestamp = new Date(data.timestamp);

    // Timestamp should be between before and after (within reasonable bounds)
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it("should return valid ISO timestamp format", async () => {
    const response = await GET();
    const data = await response.json();

    // Should be valid ISO string
    expect(() => new Date(data.timestamp)).not.toThrow();
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
