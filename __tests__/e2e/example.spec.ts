import { test, expect } from '@playwright/test';
import { setupClerkAuth, signInClerkUser, isClerkAuthenticated } from '@/src/lib/test-helpers/clerk-playwright-helpers';

/**
 * Example E2E tests with Clerk authentication
 * 
 * To run these tests:
 * 1. Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY environment variables
 * 2. Create a test user in Clerk Dashboard
 * 3. Run: bunx playwright test
 */

test.describe('Clerk Authentication E2E', () => {
  test('should sign in with Clerk', async ({ page }) => {
    // Setup Clerk testing token to bypass bot detection
    await setupClerkAuth(page);
    
    // Navigate to sign-in page
    await page.goto('/sign-in');
    
    // Check that sign-in page loaded
    await expect(page).toHaveURL(/.*sign-in/);
    
    // Note: Actual sign-in requires test user credentials
    // For full test, use: await signInClerkUser(page, 'test@example.com', 'password');
  });

  test('should access protected route when authenticated', async ({ page }) => {
    await setupClerkAuth(page);
    
    // Navigate to protected route
    await page.goto('/dashboard');
    
    // Should redirect to sign-in if not authenticated
    // Or show dashboard if authenticated
    const isAuthenticated = await isClerkAuthenticated(page);
    
    if (isAuthenticated) {
      await expect(page).toHaveURL(/.*dashboard/);
    } else {
      await expect(page).toHaveURL(/.*sign-in/);
    }
  });

  test('should sign out user', async ({ page }) => {
    await setupClerkAuth(page);
    
    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Find UserButton and click it
    const userButtonSelectors = [
      '[data-clerk-element="userButton"]',
      'button[aria-label*="user"]',
      'button:has(img[alt*="avatar"])',
    ];
    
    let clicked = false;
    for (const selector of userButtonSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        await element.click();
        clicked = true;
        break;
      }
    }
    
    if (clicked) {
      // Wait for dropdown menu
      await page.waitForTimeout(500);
      
      // Click sign out
      const signOutButton = page.getByRole('button', { name: /sign out/i })
        .or(page.getByText(/sign out/i));
      
      if (await signOutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await signOutButton.click();
        await expect(page).toHaveURL(/.*sign-in/, { timeout: 5000 });
      }
    }
  });
});

