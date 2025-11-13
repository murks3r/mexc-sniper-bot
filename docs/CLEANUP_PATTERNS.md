# Cleanup Patterns Reference Guide

Quick reference for systematic cleanup of console statements, `any` types, and TypeScript errors.

---

## Console Statement Replacement

### Pattern 1: Simple Logging
```typescript
// ❌ Before
console.log('Processing order', orderId);
console.error('Failed to execute', error);

// ✅ After
import { createLogger } from '@/src/lib/unified-logger';
const logger = createLogger('service-name');
logger.info('Processing order', { orderId });
logger.error('Failed to execute', { error });
```

### Pattern 2: Conditional Logging
```typescript
// ❌ Before
if (debug) console.log('Debug info', data);

// ✅ After
if (debug) logger.debug('Debug info', { data });
```

### Pattern 3: Error Logging with Context
```typescript
// ❌ Before
console.error('API error:', error, { endpoint, status });

// ✅ After
logger.error('API error', { endpoint, status, error });
```

### Pattern 4: Component Logging
```typescript
// ❌ Before (in React components)
console.log('Component mounted', props);

// ✅ After
import { createLogger } from '@/src/lib/unified-logger';
const logger = createLogger('ComponentName');
logger.debug('Component mounted', { props });
```

**Note**: Logger instances should be created at module level, not inside components/hooks.

---

## `any` Type Replacement

### Pattern 1: API Response Types
```typescript
// ❌ Before
function handleResponse(response: any) {
  return response.data;
}

// ✅ After
type ApiResponse<T> = {
  data: T;
  status: number;
  error?: string;
};

function handleResponse<T>(response: ApiResponse<T>): T {
  return response.data;
}
```

### Pattern 2: Event Handlers
```typescript
// ❌ Before
function handleEvent(event: any) {
  const { type, payload } = event;
}

// ✅ After
type Event = {
  type: string;
  payload: Record<string, unknown>;
};

function handleEvent(event: Event) {
  const { type, payload } = event;
}
```

### Pattern 3: Configuration Objects
```typescript
// ❌ Before
function configureService(config: any) {
  // ...
}

// ✅ After
type ServiceConfig = {
  apiKey: string;
  timeout: number;
  retries?: number;
};

function configureService(config: ServiceConfig) {
  // ...
}
```

### Pattern 4: Logger Context
```typescript
// ❌ Before
logger.info('Message', context as any);

// ✅ After
type LogContext = Record<string, unknown>;
logger.info('Message', context as LogContext);
```

### Pattern 5: Dynamic Component Props
```typescript
// ❌ Before
function loadComponent(component: any, props: any) {
  return React.createElement(component, props);
}

// ✅ After
type ComponentProps = Record<string, unknown>;
function loadComponent(
  component: React.ComponentType<ComponentProps>,
  props: ComponentProps
) {
  return React.createElement(component, props);
}
```

### Pattern 6: Generic Functions
```typescript
// ❌ Before
function processData(data: any): any {
  return transform(data);
}

// ✅ After
function processData<TInput, TOutput>(
  data: TInput,
  transform: (input: TInput) => TOutput
): TOutput {
  return transform(data);
}
```

---

## Common TypeScript Error Fixes

### Error 1: Missing Exports
```typescript
// ❌ Error: Module has no exported member 'apiCredentials'
import { apiCredentials } from '@/src/db/schemas/auth';

// ✅ Fix: Check export in schema file
// In src/db/schemas/auth.ts:
export { apiCredentials } from './trading'; // or correct path
```

### Error 2: Property Name Mismatches
```typescript
// ❌ Error: Property 'autoSnipingEnabled' does not exist
const enabled = prefs.autoSnipingEnabled;

// ✅ Fix: Use correct property name
const enabled = prefs.autoSnipeEnabled;
```

### Error 3: Missing Properties in Types
```typescript
// ❌ Error: Property 'userId' does not exist in type 'CoreTradingConfig'
const config: CoreTradingConfig = { userId: '123' };

// ✅ Fix: Add property to type definition
type CoreTradingConfig = {
  userId: string;
  // ... other properties
};
```

### Error 4: Type Argument Mismatches
```typescript
// ❌ Error: Expected 0-1 type arguments, but got 2
const result = someFunction<Type1, Type2>();

// ✅ Fix: Check function signature and use correct number of type args
const result = someFunction<Type1>();
```

### Error 5: Date/String Type Mismatches
```typescript
// ❌ Error: Type 'Date' is not assignable to type 'string'
const timestamp: string = new Date();

// ✅ Fix: Convert Date to string
const timestamp: string = new Date().toISOString();
```

### Error 6: Missing Method on Interface
```typescript
// ❌ Error: Property 'executeSnipeTarget' does not exist
service.executeSnipeTarget(target);

// ✅ Fix: Add method to interface
interface CoreTradingService {
  executeSnipeTarget(target: SnipeTarget): Promise<Result>;
  // ... other methods
}
```

### Error 7: Auth Type Mismatches
```typescript
// ❌ Error: Module has no exported member 'Session'
import { Session } from '@clerk/nextjs';

// ✅ Fix: Use correct import
import { auth } from '@clerk/nextjs';
const session = await auth();
```

---

## Module-by-Module Cleanup Checklist

### Core Trading Services (`src/services/trading/`)
- [ ] Replace `any` types in service interfaces
- [ ] Fix TypeScript errors in base-service.ts
- [ ] Replace console statements with logger
- [ ] Fix configuration type mismatches

### API Services (`src/services/api/`)
- [ ] Replace `any` types in API schemas
- [ ] Fix response type definitions
- [ ] Replace console statements
- [ ] Fix service configuration types

### Library Utilities (`src/lib/`)
- [ ] Fix `api-schemas.ts` (46 `any` types)
- [ ] Replace console statements in logger utilities
- [ ] Fix opentelemetry type issues
- [ ] Replace `any` in logger-injection.ts

### Components (`src/components/`)
- [ ] Fix dynamic-component-loader.tsx (31 `any` types)
- [ ] Replace console statements
- [ ] Fix component prop types

### Hooks (`src/hooks/`)
- [ ] Replace console statements (especially use-pattern-sniper.ts)
- [ ] Fix hook return types
- [ ] Replace `any` types in event handlers

### Database (`src/db/`)
- [ ] Fix schema export issues
- [ ] Fix Date/string type mismatches
- [ ] Fix vector-utils.ts retry config types

---

## Quick Wins (High Impact, Low Effort)

1. **Fix property name mismatches** (5-10 min each)
   - `autoSnipingEnabled` → `autoSnipeEnabled`
   - `defaultBuyAmount` → `defaultBuyAmountUsdt`

2. **Add missing exports** (2-5 min each)
   - Export missing schema members
   - Fix import paths

3. **Replace simple console.log** (1-2 min each)
   - Single-line console statements
   - No complex context

4. **Fix simple type annotations** (3-5 min each)
   - Replace `any` with `unknown` first
   - Then narrow to specific types

---

## Tools and Commands

### Find Console Statements
```bash
grep -r "console\." src/ --include="*.ts" --include="*.tsx" | wc -l
```

### Find `any` Types
```bash
grep -r ":\s*any\b\|:\s*any\[\|any\s*\|\|" src/ --include="*.ts" --include="*.tsx" | wc -l
```

### Check TypeScript Errors
```bash
bun run tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

### Run Tests
```bash
bun test
```

---

## Notes

- **Incremental approach**: Fix one module at a time
- **Test after each change**: Ensure no regressions
- **Commit frequently**: Small, focused commits
- **Document decisions**: Note why certain `any` types remain (if any)

