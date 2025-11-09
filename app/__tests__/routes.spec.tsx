import { describe, expect, it } from "vitest";

/**
 * Integration tests to verify key routes work before Next.js 16 upgrade
 * These tests ensure routes can be imported and don't have breaking syntax errors
 */
describe("Route Integration Tests", () => {
  it("should import root layout without errors", async () => {
    const layout = await import("../layout");
    expect(layout).toBeDefined();
    expect(layout.default).toBeDefined();
  });

  it("should import root page without errors", async () => {
    const page = await import("../page");
    expect(page).toBeDefined();
    expect(page.default).toBeDefined();
  });

  it("should import dashboard page without errors", async () => {
    const page = await import("../dashboard/page");
    expect(page).toBeDefined();
    expect(page.default).toBeDefined();
  });

  it("should import auth page without errors", async () => {
    const page = await import("../auth/page");
    expect(page).toBeDefined();
    expect(page.default).toBeDefined();
  });

  it("should import error boundary without errors", async () => {
    const error = await import("../error");
    expect(error).toBeDefined();
    expect(error.default).toBeDefined();
  });

  it("should import not-found page without errors", async () => {
    const notFound = await import("../not-found");
    expect(notFound).toBeDefined();
    expect(notFound.default).toBeDefined();
  });
});
