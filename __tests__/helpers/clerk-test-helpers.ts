import { NextRequest } from 'next/server'
import type { User } from '@clerk/nextjs/server'
import { vi } from 'vitest'

/**
 * Mock Clerk user for testing
 */
export function createMockClerkUser(overrides: Partial<User> = {}): User {
  const defaultUser: User = {
    id: 'test-user-' + Math.random().toString(36).substring(7),
    primaryEmailAddressId: null,
    primaryPhoneNumberId: null,
    primaryWeb3WalletId: null,
    username: 'testuser',
    emailAddresses: [
      {
        id: 'email-1',
        emailAddress: 'test@example.com',
        verification: {
          status: 'verified',
          strategy: 'email_code',
          attemptCount: 0,
          expireAt: null,
        },
        linkedTo: [],
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime(),
      },
    ],
    phoneNumbers: [],
    web3Wallets: [],
    externalAccounts: [],
    organizationMemberships: [],
    profileImageUrl: 'https://example.com/avatar.jpg',
    passwordEnabled: true,
    totpEnabled: false,
    backupCodeEnabled: false,
    twoFactorEnabled: false,
    publicMetadata: {},
    unsafeMetadata: {},
    privateMetadata: {},
    createdAt: new Date().getTime(),
    updatedAt: new Date().getTime(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as User

  return { ...defaultUser, ...overrides } as User
}

/**
 * Create a mock NextRequest with Clerk authentication headers
 */
export function createAuthenticatedClerkRequest(
  user: User,
  options: { headers?: HeadersInit } = {},
): NextRequest {
  const headers = new Headers(options.headers || {})
  
  // Add Clerk session token to headers
  headers.set('Authorization', `Bearer mock-clerk-token`)
  headers.set('X-Clerk-User-Id', user.id)
  
  return new NextRequest('http://localhost:3000/api/test', {
    ...options,
    headers,
  })
}

/**
 * Mock function that simulates Clerk auth in tests
 */
export function mockClerkAuth(userId?: string) {
  const mockUser = createMockClerkUser(
    userId ? { id: userId } : undefined
  )

  const mockAuth = {
    userId: mockUser.id,
    sessionId: 'mock-session-' + Math.random().toString(36).substring(7),
    orgId: null,
    orgRole: null,
    orgSlug: null,
    has: vi.fn(() => true),
    getToken: vi.fn(() => Promise.resolve('mock-clerk-token')),
    debug: vi.fn(),
  }

  return { user: mockUser, auth: mockAuth }
}

/**
 * Helper to create test environment variables for Clerk
 */
export function setupClerkTestEnvironment() {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_mock_key'
  process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_mock_key'
  process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL = '/sign-in'
  process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL = '/'
  process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL = '/'
}

/**
 * Cleanup mock Clerk environment
 */
export function cleanupClerkTestEnvironment() {
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  delete process.env.CLERK_SECRET_KEY
  delete process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL
  delete process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
  delete process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
}

/**
 * Type guard for Clerk User
 */
export function isClerkUser(user: any): user is User {
  return (
    user &&
    typeof user === 'object' &&
    'id' in user &&
    'emailAddresses' in user &&
    Array.isArray(user.emailAddresses)
  )
}

/**
 * Wait for Clerk to be loaded in tests
 */
export async function waitForClerkLoaded(page: any): Promise<void> {
  await page.waitForFunction(() => {
    return window.Clerk?.loaded
  })
}

/**
 * Check if user is authenticated in browser context
 */
export async function isUserAuthenticated(page: any): Promise<boolean> {
  return await page.evaluate(() => {
    return window.Clerk?.user !== null
  })
}

/**
 * Mock Clerk environment for Jest/Vitest unit tests
 */
export function setupMockClerkEnvironment() {
  // Mock Clerk environment
  global.Clerk = {
    clerk: vi.fn(),
    loaded: true,
    user: null,
    session: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    openSignIn: vi.fn(),
    openSignUp: vi.fn(),
    openUserProfile: vi.fn(),
    openOrganizationProfile: vi.fn(),
    redirectWithAuth: vi.fn(),
    handleRedirectCallback: vi.fn(),
    handleEmailLinkVerification: vi.fn(),
    authenticateWithMetamask: vi.fn(),
    createOrganization: vi.fn(),
    getOrganization: vi.fn(),
    joinOrganization: vi.fn(),
    leaveOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    addUserToOrganization: vi.fn(),
    updateUserInOrganization: vi.fn(),
    removeUserFromOrganization: vi.fn(),
    getOrganizationRoles: vi.fn(),
    getOrganizationInvitations: vi.fn(),
    getOrganizationMembers: vi.fn(),
    inviteUserToOrganization: vi.fn(),
    revokeOrganizationInvitation: vi.fn(),
    resendOrganizationInvitation: vi.fn(),
    acceptOrganizationInvitation: vi.fn(),
    rejectOrganizationInvitation: vi.fn(),
    createOrganizationInvitation: vi.fn(),
    updateOrganizationInvitation: vi.fn(),
    deleteOrganizationInvitation: vi.fn(),
    mountUserButton: vi.fn(),
    mountUserProfile: vi.fn(),
    mountOrganizationSwitcher: vi.fn(),
    mountOrganizationProfile: vi.fn(),
    mountOrganizationList: vi.fn(),
    mountCreateOrganization: vi.fn(),
    getOrganizationMemberships: vi.fn(),
    getOrganizationInvitations: vi.fn(),
  } as any
}

/**
 * Cleanup mock Clerk environment
 */
export function teardownMockClerkEnvironment() {
  delete global.Clerk
}
