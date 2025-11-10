/// <reference types="vitest/globals" />

import type { TestContext } from 'vitest';

declare global {
  namespace vi {
    export * from 'vitest';
  }
  
  // Vitest globals
  const describe: typeof import('vitest').describe;
  const it: typeof import('vitest').it;
  const test: typeof import('vitest').test;
  const expect: typeof import('vitest').expect;
  const beforeEach: typeof import('vitest').beforeEach;
  const afterEach: typeof import('vitest').afterEach;
  const beforeAll: typeof import('vitest').beforeAll;
  const afterAll: typeof import('vitest').afterAll;
  const vi: typeof import('vitest').vi;
}

// Extend TestContext to fix call signature issues
declare module 'vitest' {
  interface TestContext {
    // Add any missing methods if needed
  }
}

export {};