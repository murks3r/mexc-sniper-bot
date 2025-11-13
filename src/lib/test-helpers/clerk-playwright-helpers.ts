/**
 * Clerk Playwright Test Helpers
 *
 * Utilities for testing authenticated flows with Clerk in Playwright E2E tests.
 * Uses Clerk's testing tokens to bypass bot detection.
 *
 * See: https://clerk.com/docs/guides/development/testing/playwright/overview
 */

import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Setup Clerk testing token for a Playwright page
 * This bypasses bot detection mechanisms during testing
 *
 * @param page - Playwright page instance
 * @example
 * ```ts
 * test('authenticated flow', async ({ page }) => {
 *   await setupClerkAuth(page);
 *   await page.goto('/dashboard');
 *   // Test authenticated content
 * });
 * ```
 */
export async function setupClerkAuth(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
}

/**
 * Sign in a test user via Clerk in Playwright
 * Requires CLERK_SECRET_KEY and test user credentials
 *
 * @param page - Playwright page instance
 * @param email - Test user email
 * @param password - Test user password
 * @example
 * ```ts
 * test('user dashboard', async ({ page }) => {
 *   await setupClerkAuth(page);
 *   await signInClerkUser(page, 'test@example.com', 'TestPassword123!');
 *   await page.goto('/dashboard');
 *   // Test authenticated content
 * });
 * ```
 */
export async function signInClerkUser(page: Page, email: string, password: string): Promise<void> {
  await setupClerkAuth(page);
  await page.goto("/sign-in");

  // Fill in sign-in form
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for navigation after sign-in
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 10000 });
}

/**
 * Sign out current user in Playwright
 *
 * @param page - Playwright page instance
 */
export async function signOutClerkUser(page: Page): Promise<void> {
  // Find and click sign out button
  // Adjust selector based on your UI
  const signOutButton = page.locator('button:has-text("Sign out"), button:has-text("Sign Out")');
  if (await signOutButton.isVisible()) {
    await signOutButton.click();
    await page.waitForURL((url) => url.pathname.includes("/sign-in"), { timeout: 5000 });
  }
}

/**
 * Wait for Clerk to be loaded on the page
 *
 * @param page - Playwright page instance
 */
export async function waitForClerkLoad(page: Page): Promise<void> {
  // Wait for Clerk to initialize
  await page.waitForFunction(
    () => {
      return typeof window !== "undefined" && (window as any).Clerk !== undefined;
    },
    { timeout: 10000 },
  );
}

/**
 * Get current Clerk user from the page
 * Requires Clerk to be loaded
 *
 * @param page - Playwright page instance
 * @returns User object or null if not authenticated
 */
export async function getClerkUser(page: Page): Promise<any | null> {
  await waitForClerkLoad(page);

  return await page.evaluate(() => {
    return (window as any).Clerk?.user || null;
  });
}

/**
 * Check if user is authenticated
 *
 * @param page - Playwright page instance
 * @returns true if authenticated, false otherwise
 */
export async function isClerkAuthenticated(page: Page): Promise<boolean> {
  const user = await getClerkUser(page);
  return user !== null;
}
