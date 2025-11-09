# MEXC Sniper Bot 🎯

A focused cryptocurrency trading bot for automated sniping of new token listings on the MEXC exchange. Features pattern detection, calendar sync, and automated execution with position management.

## 🚀 Key Features

- **🎯 Auto-Sniping**: Automated execution of snipe targets with configurable position sizing
- **🔍 Pattern Detection**: Detection of MEXC ready state patterns (sts:2, st:2, tt:4) without AI dependencies
- **⏰ Calendar Sync**: Automatic sync of MEXC calendar listings to create snipe targets
- **📊 Position Management**: Automated position monitoring with stop-loss, take-profit, and time-based exits
- **⚡ Pure TypeScript Architecture**: Modern stack with Next.js 15, Drizzle ORM, and TanStack Query
- **🛡️ Robust Error Handling**: Comprehensive error handling and retry logic
- **📈 Confidence Scoring**: 0-100% reliability metrics for every trading signal
- **⚙️ User Configurable**: Customizable take profit levels, stop-loss, and risk management
- **🔐 Secure Authentication**: Supabase Auth with email bypass and rate limit handling
- **🧪 Comprehensive Testing**: Extensive test suite with Vitest and Playwright

## 🏗️ Architecture

Focused sniping system with core components:

```
┌─────────────────────────────────────────────────────────────┐
│                  Auto-Sniping Module                        │
│              (Core Sniping Execution)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
    │Calendar│   │Pattern │   │Position│
    │  Sync  │   │Detection│   │Manager │
    │        │   │        │   │        │
    └────┬───┘   └────┬───┘   └────┬───┘
         │            │            │
         └────────────┼────────────┘
                      │
                 ┌────▼───┐
                 │MEXC API│
                 │Service │
                 └────────┘
```

### 🎯 **Core Components**

**Sniping System:**
- **📅 Calendar Sync**: Automatic sync of MEXC calendar listings to create snipe targets
- **🔍 Pattern Detection**: Ready state detection and pattern validation (`sts:2, st:2, tt:4`)
- **🎯 Auto-Sniping**: Automated execution of snipe targets at launch time
- **📊 Position Management**: Automated position monitoring with stop-loss, take-profit, and time-based exits
- **🌐 MEXC API Integration**: Core MEXC API service for trading and market data

### 🚀 **Technology Stack**

- **Frontend**: Next.js 15 with TypeScript and React 19
- **Authentication**: Supabase Auth with secure session management
- **Workflows**: Inngest for reliable background task orchestration (calendar sync)
- **Database**: Drizzle ORM with PostgreSQL for data persistence
- **Data Management**: TanStack Query v5.80.6 for real-time data fetching and caching
- **Logging**: Console-based logging for simplicity
- **Testing**: Vitest (unit), Playwright (E2E)
- **Code Quality**: Biome.js for formatting and linting, TypeScript for type safety
- **Deployment**: Vercel with automatic scaling and edge optimization

## 📋 Prerequisites

- **Node.js 20.11.0+** and bun/npm (see package.json engines)
- **Supabase account** (required for authentication)
- **MEXC API credentials** (required for trading execution)
- **PostgreSQL database** (Supabase, NeonDB, or local PostgreSQL)

## 🛠️ Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-username/mexc-sniper-bot.git
cd mexc-sniper-bot

# Install dependencies with bun (recommended)
bun install

# Or with npm
npm install
```

### 2. Environment Setup

Create a `.env.local` file:

```bash
# Required - Supabase Authentication
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional - Custom SMTP (recommended for production)
SUPABASE_SMTP_HOST=smtp.resend.com
SUPABASE_SMTP_PORT=587
SUPABASE_SMTP_USER=resend
SUPABASE_SMTP_PASS=re_your-api-key

# Optional - MEXC API Access
MEXC_API_KEY=your_mexc_api_key
MEXC_SECRET_KEY=your_mexc_secret_key
MEXC_BASE_URL=https://api.mexc.com

# Database Configuration
# Option 1: Local SQLite (default for development)
DATABASE_URL=sqlite:///./mexc_sniper.db

# Option 2: NeonDB (recommended for production)
# DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require

# Optional - Workflow Orchestration (auto-generated if not provided)
# INNGEST_SIGNING_KEY=your_signing_key
# INNGEST_EVENT_KEY=your_event_key
# Optional credentials for automated E2E tests
TEST_USER_EMAIL=your_test_email@example.com
TEST_USER_PASSWORD=your_test_password
```

### 2.1. Supabase Authentication Setup

1. **Create a Supabase account** at [https://supabase.com](https://supabase.com)
2. **Create a new project** in your Supabase dashboard
3. **Configure authentication settings**:
   - Site URL: `http://localhost:3008`
   - Redirect URLs: `http://localhost:3008/auth/callback`
   - Email confirmation: Can be bypassed in development
4. **Copy credentials** from Settings → API to your `.env.local` file
5. **Optional**: Configure custom SMTP for production (see SMTP Configuration Guide)

### 3. Setup Database

```bash
# Initialize database with migrations
make db-migrate

# Or using bun directly
bun run db:migrate
```

### 4. Run Development Environment

Use the convenient Makefile commands:

```bash
# Start all development servers (Next.js + Inngest)
make dev

# Or start individually:
make dev-next    # Next.js on port 3008
make dev-inngest # Inngest dev server on port 8288
```

### 5. Access the Application

- **Homepage**: http://localhost:3008 (public landing page)
- **Authentication**: http://localhost:3008/auth (Supabase Auth login)
- **Trading Dashboard**: http://localhost:3008/dashboard (authenticated users)
- **Inngest Dashboard**: http://localhost:8288 (development workflow monitoring)

## 🚀 Sniping System

### 🚀 Inngest Workflows

The system uses event-driven Inngest workflows for reliable execution:

#### **Calendar Sync Workflow**
```typescript
// Trigger calendar sync to create snipe targets
await inngest.send({
  name: "mexc/calendar.poll",
  data: { triggeredBy: "manual", timestamp: new Date().toISOString() }
});
```

This workflow:
- Fetches calendar listings from MEXC API
- Creates snipe targets for upcoming launches
- Updates existing targets with new information

## ⚙️ User Configuration

### Take Profit Levels
Configure your preferred take profit percentages:

- **Level 1**: Conservative (default: 5%)
- **Level 2**: Moderate (default: 10%)
- **Level 3**: Aggressive (default: 15%)
- **Level 4**: Very Aggressive (default: 25%)
- **Custom**: User-defined percentage

### Trading Preferences
- **Default Buy Amount**: USDT amount per trade
- **Max Concurrent Snipes**: Parallel trade limit
- **Ready State Pattern**: Pattern indicating token readiness (default: 2,2,4)
- **Stop Loss Percent**: Automatic stop-loss trigger
- **Risk Tolerance**: Low, Medium, High
- **Target Advance Hours**: How far ahead to detect opportunities

## 📊 Database Schema

The system uses Drizzle ORM with the following key tables:

- **user_preferences**: Trading configuration and take profit levels
- **api_credentials**: Encrypted API keys and credentials
- **monitored_listings**: Tracked MEXC listings with pattern states
- **snipe_targets**: Active trading targets with execution details
- **execution_history**: Complete trading history and performance metrics

## 🚀 Deployment

### Primary: Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel Dashboard
3. Add environment variables (including NeonDB credentials)
4. Deploy

**Important**: The system is optimized for Vercel's edge infrastructure with NeonDB for global low-latency data access.

### Alternative: Deploy to Railway

Railway offers persistent containers and built-in monitoring:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Database Setup

1. Set up a PostgreSQL database (local or cloud provider)
2. Get your connection string
3. Add the connection string to your environment variables:
   ```bash
   DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require
   ```

### Manual Deployment

```bash
# Build and deploy to Vercel
make build
vercel --prod

# Or deploy to Railway
railway up
```

For detailed deployment instructions, see [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)

## 📚 Documentation

### Authentication System
- [Developer Onboarding Guide](docs/DEVELOPER_AUTH_ONBOARDING_GUIDE.md) - Complete setup for new developers
- [Supabase Migration Guide](docs/NEXTAUTH_TO_SUPABASE_MIGRATION_GUIDE.md) - Migration from NextAuth to Supabase
- [SMTP Configuration Guide](docs/SMTP_CONFIGURATION_GUIDE.md) - Custom email setup for production
- [Rate Limit Handling](docs/RATE_LIMIT_HANDLING_SYSTEM.md) - Rate limit management and UX
- [Authentication Troubleshooting](docs/AUTH_TROUBLESHOOTING_GUIDE.md) - Common issues and solutions
- [Supabase Rate Limit Fix](docs/SUPABASE_AUTH_RATE_LIMIT_FIX.md) - Email bypass and workarounds

### Core Documentation
- [Architecture Review](docs/architecture/ARCHITECTURE_REVIEW.md) - Codebase analysis and refactoring plan
- [Quick Start Guide](docs/guides/QUICKSTART.md) - Getting started with sniping

### Deployment & Operations
- [Deployment Guide](docs/deployment/DEPLOYMENT.md) - Production deployment

### Development
- [Contributing Guide](docs/development/CONTRIBUTING.md) - Development guidelines
- [Quick Start Guide](docs/guides/QUICKSTART.md) - Getting started
- [Secure Encryption Guide](docs/guides/SECURE_ENCRYPTION_QUICKSTART.md) - Security setup

## 🧪 Testing & Development

### Testing Framework

The project includes comprehensive testing with **293 tests achieving 96%+ pass rate** across multiple frameworks:

#### **Unit Tests (Vitest)**
```bash
# Run unit tests
bun run test
npm run test:unit

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

#### **End-to-End Tests (Playwright)**
```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run in headed mode
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug

# View reports
npm run test:e2e:report
```

#### **Complete Test Suite**
```bash
# Run all tests (unit + E2E)
npm run test

# CI test pipeline
npm run test:fast
```

### Code Quality

```bash
# Run all linters and formatters (Biome.js)
bun run lint:all

# Individual checks
bun run lint          # Lint with Biome
bun run format        # Format with Biome
bun run type-check    # TypeScript validation

# Pre-commit checks
bun run pre-commit
```

### Database Operations

```bash
# Generate new migrations
make db-generate

# Apply migrations
make db-migrate

# Open database studio
make db-studio

# Reset database (WARNING: destroys data)
make db-reset
```

### Utilities

```bash
# Check project status
make status

# Clean generated files
make clean

# Check for outdated dependencies
make deps-check

# Update dependencies
make deps-update
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass and linting is clean
5. Submit a pull request

### Development Guidelines

- **TypeScript First**: All new code must be in TypeScript with strict type checking
- **Testing Required**: Write unit tests (Vitest) and E2E tests (Playwright) for new features
- **Code Quality**: Use Biome.js for formatting and linting, maintain high test pass rate
- **Focus**: Keep code focused on sniping functionality - avoid adding non-essential features
- **Database**: Use Drizzle ORM for all database operations with safe migrations
- **Authentication**: All protected routes must use Supabase Auth integration
- **Error Handling**: Implement comprehensive error handling with proper logging
- **Documentation**: Add JSDoc comments and update relevant documentation
- **Performance**: Optimize for Vercel serverless deployment and global edge performance

## ⚠️ Disclaimer

This bot is for educational purposes. Cryptocurrency trading carries significant risk. Never invest more than you can afford to lose. The authors are not responsible for any financial losses.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.