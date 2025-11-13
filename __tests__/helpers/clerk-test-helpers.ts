import type { NextRequest } from 'next/server'
import type { User } from '@clerk/nextjs/server'
import type { NextFetchRequestConfig } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

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
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as User

  return { ...defaultUser, ...overrides } as User
}

/**
 * Create a mock NextRequest with Clerk authentication headers
 */
export function createAuthenticatedClerkRequest(
  user: User,
  options: NextFetchRequestConfig = {},
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
    has: jest.fn(() => true),
    getToken: jest.fn(() => Promise.resolve('mock-clerk-token')),
    debug: jest.fn(),
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
    clerk: jest.fn(),
    loaded: true,
    user: null,
    session: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    openSignIn: jest.fn(),
    openSignUp: jest.fn(),
    openUserProfile: jest.fn(),
    openOrganizationProfile: jest.fn(),
    redirectWithAuth: jest.fn(),
    handleRedirectCallback: jest.fn(),
    handleEmailLinkVerification: jest.fn(),
    authenticateWithMetamask: jest.fn(),
    createOrganization: jest.fn(),
    getOrganization: jest.fn(),
    joinOrganization: jest.fn(),
    leaveOrganization: jest.fn(),
    updateOrganization: jest.fn(),
    addUserToOrganization: jest.fn(),
    updateUserInOrganization: jest.fn(),
    removeUserFromOrganization: jest.fn(),
    getOrganizationRoles: jest.fn(),
    getOrganizationInvitations: jest.fn(),
    getOrganizationMembers: jest.fn(),
    inviteUserToOrganization: jest.fn(),
    revokeOrganizationInvitation: jest.fn(),
    resendOrganizationInvitation: jest.fn(),
    acceptOrganizationInvitation: jest.fn(),
    rejectOrganizationInvitation: jest.fn(),
    createOrganizationInvitation: jest.fn(),
    updateOrganizationInvitation: jest.fn(),
    deleteOrganizationInvitation: jest.fn(),
    mountUserButton: jest.fn(),
    mountUserProfile: jest.fn(),
    mountOrganizationSwitcher: jest.fn(),
    mountOrganizationProfile: jest.fn(),
    mountOrganizationList: jest.fn(),
    mountCreateOrganization: jest.fn(),
    getOrganizationMemberships: jest.fn(),
    getOrganizationInvitations: jest.fn(),
  } as any
}

/**
 * Cleanup mock Clerk environment
 */
export function teardownMockClerkEnvironment() {
  delete global.Clerk
}
