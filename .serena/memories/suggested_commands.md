# MEXC Sniper Bot - Project Commands

## Development
```bash
# Start all development servers (Next.js + Inngest)
make dev

# Start only Next.js dev server
make dev-next

# Start only Inngest dev server
make dev-inngest
```

## Testing
```bash
# Run all tests
make test
bun test

# Run tests in watch mode
make test-watch
bun test:watch

# Run tests with coverage
make test-coverage
bun test:coverage

# Run e2e tests
bun test:e2e
bun test:e2e:ui
bun test:e2e:debug
```

## Code Quality
```bash
# Run linter (with auto-fix)
make lint
bun run lint

# Format code
make format
bun run format

# Type check TypeScript
make type-check
bun run type-check

# Run all quality checks (recommended before commits)
bun run lint
bun run type-check
bun test
```

## Database
```bash
# Run migrations
make db-migrate
bun run db:migrate

# Push schema changes
make db-push
bun run db:push

# Open Drizzle Studio
make db-studio
bun run db:studio
```

## Build & Production
```bash
# Build application
make build
bun run build

# Start production server
bun run start
```

## Utilities
```bash
# Check project status
make status

# Kill all ports
make kill-ports

# Install dependencies
make install
bun install
```

## Testing Strategy

### Unit Tests (Vitest)
- Test files: `*.test.ts`, `*.spec.ts`
- Run: `bun test`
- Coverage: `bun test:coverage`

### E2E Tests (Playwright)
- Test files: `__tests__/e2e/`
- Run: `bun test:e2e`
- UI Mode: `bun test:e2e:ui`

### Integration Tests
- Set `USE_REAL_SUPABASE=true` for real database tests
- Run: `bun test:integration`

## Environment Setup
Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` or `SUPABASE_URL` (auto-derived)
- `MEXC_API_KEY` / `MEXC_SECRET_KEY` (for trading)

## Before Committing
1. Run linter: `bun run lint`
2. Type check: `bun run type-check`
3. Run tests: `bun test`
4. Format code: `bun run format`

## Project Structure
- `/src/lib` - Core utilities, logger, database
- `/src/services` - Trading services, API clients
- `/src/components` - React components
- `/src/db` - Database schema, migrations
- `/app` - Next.js App Router pages
- `/scripts` - Utility scripts
- `/__tests__` - Integration tests
