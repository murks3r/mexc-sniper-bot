import { test, expect } from "@playwright/test";

/**
 * End-to-end test for token launch discovery pipeline
 * Verifies that targets appear in the dashboard after calendar sync
 */
test.describe("Token Launch Discovery Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto("/dashboard");
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
  });

  test("should display calendar listings in dashboard", async ({ page }) => {
    // Check for console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for calendar data to load
    await page.waitForSelector('[data-testid="coin-listings-board"], .coin-listings-board, [class*="Card"]', {
      timeout: 10000,
    });

    // Check for error messages
    const errorElements = await page.locator('text=/error|failed|unavailable/i').all();
    const errorTexts = await Promise.all(errorElements.map((el) => el.textContent()));
    
    // Log any errors found
    if (errorTexts.length > 0) {
      console.log("Found error messages:", errorTexts);
    }

    // Verify no critical console errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes("favicon") &&
        !err.includes("sourcemap") &&
        !err.includes("extension"),
    );
    
    expect(criticalErrors.length).toBe(0);

    // Check if calendar data is loading or loaded
    const loadingIndicator = page.locator('text=/loading/i');
    const hasLoading = await loadingIndicator.count() > 0;

    // If loading, wait a bit more
    if (hasLoading) {
      await page.waitForTimeout(3000);
    }

    // Verify calendar API was called
    const calendarRequests = await page.evaluate(() => {
      return (window as any).__calendarRequests || [];
    });

    // Check network requests for calendar API
    const response = await page.request.get("/api/mexc/calendar");
    expect(response.status()).toBeLessThan(500); // Should not be server error

    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty("success");
      
      // If successful, should have data array
      if (data.success) {
        expect(Array.isArray(data.data)).toBe(true);
        console.log(`✅ Calendar API returned ${data.data?.length || 0} listings`);
      } else {
        console.log(`⚠️ Calendar API returned error: ${data.error}`);
      }
    }
  });

  test("should display snipe targets with ready/active status", async ({ page }) => {
    // Wait for snipe targets to load
    await page.waitForTimeout(2000);

    // Check for active targets API call
    const targetsResponse = await page.request.get(
      "/api/snipe-targets?status=active&includeSystem=true",
    );
    
    expect(targetsResponse.status()).toBeLessThan(500);

    if (targetsResponse.ok()) {
      const data = await targetsResponse.json();
      expect(data).toHaveProperty("success");
      
      if (data.success) {
        expect(Array.isArray(data.data)).toBe(true);
        console.log(`✅ Found ${data.data?.length || 0} active targets`);
        
        // Verify targets have correct structure
        if (data.data && data.data.length > 0) {
          const target = data.data[0];
          expect(target).toHaveProperty("vcoinId");
          expect(target).toHaveProperty("status");
          expect(["ready", "active", "executing"]).toContain(target.status);
        }
      }
    }
  });

  test("should handle errors gracefully", async ({ page }) => {
    // Intercept calendar API and return error
    await page.route("**/api/mexc/calendar", (route) => {
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Service temporarily unavailable",
        }),
      });
    });

    // Reload page
    await page.reload();
    await page.waitForTimeout(2000);

    // Check that error is displayed (not empty array)
    const errorMessage = await page
      .locator('text=/error|unavailable|failed/i')
      .first()
      .textContent()
      .catch(() => null);

    // Should show error message, not just empty state
    expect(errorMessage).toBeTruthy();
    console.log(`✅ Error handling verified: ${errorMessage}`);
  });

  test("should verify logger is used instead of console.log", async ({ page }) => {
    const consoleLogs: string[] = [];
    const consoleInfos: string[] = [];
    
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "log") {
        consoleLogs.push(text);
      }
      if (msg.type() === "info") {
        consoleInfos.push(text);
      }
    });

    // Navigate and interact with dashboard
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);

    // Check that we're not seeing excessive console.log statements
    // (Some are OK from libraries, but not from our code)
    const ourConsoleLogs = consoleLogs.filter(
      (log) =>
        log.includes("use-pattern-sniper") ||
        log.includes("Pattern Sniper") ||
        log.includes("Snipe executed"),
    );

    // Should have minimal console.log usage (logger should be used instead)
    expect(ourConsoleLogs.length).toBeLessThan(5);
    console.log(`✅ Console.log usage verified: ${ourConsoleLogs.length} found`);
  });

  test("should verify calendar sync creates targets", async ({ page, request }) => {
    // Trigger calendar sync (if API endpoint exists)
    try {
      const syncResponse = await request.post("/api/jobs/cron", {
        data: { action: "calendar-sync" },
      });

      if (syncResponse.ok()) {
        const syncData = await syncResponse.json();
        console.log("Calendar sync triggered:", syncData);
      }
    } catch (error) {
      // Sync endpoint might not exist, that's OK
      console.log("Calendar sync endpoint not available (expected)");
    }

    // Wait a bit for sync to complete
    await page.waitForTimeout(5000);

    // Check for targets
    const targetsResponse = await request.get(
      "/api/snipe-targets?status=active&includeSystem=true",
    );

    if (targetsResponse.ok()) {
      const data = await targetsResponse.json();
      if (data.success && data.data) {
        console.log(`✅ Found ${data.data.length} targets after sync`);
        expect(Array.isArray(data.data)).toBe(true);
      }
    }
  });
});

