# MEXC Sniper Bot - End-to-End Tests

This directory contains comprehensive end-to-end tests that demonstrate the MEXC Sniper Bot is working as expected. These tests provide complete coverage of the bot's functionality using real data from MEXC APIs.

## 🎯 Current Test Coverage

### 1. Real Data Paper Trading (`real-data-paper-trading.test.ts`)
**Primary demonstration test** that shows the bot working with real MEXC data:
- ✅ **Real MEXC Calendar Data**: Uses actual upcoming listings from MEXC API
- ✅ **Real Market Analysis**: Analyzes actual market conditions and opportunities  
- ✅ **Paper Trading Mode**: Safe simulation with no real money at risk
- ✅ **Automatic Trading**: Demonstrates complete automated trading workflow
- ✅ **Real VCoin IDs**: Uses actual MEXC VCoin identifiers
- ✅ **Real Project Names**: Uses actual project information from MEXC

### 2. Simplified Bot Demonstration (`simplified-bot-demonstration.test.ts`)
**Core functionality test** that verifies essential bot operations:
- ✅ **System Health**: Verifies all systems are operational
- ✅ **MEXC Connectivity**: Confirms connection to MEXC API
- ✅ **Workflow Status**: Checks all trading workflows are active
- ✅ **Database Operations**: Tests user preferences and data storage
- ✅ **Performance Metrics**: Validates system performance

### 3. Authentication Tests (Multiple `.spec.ts` files)
**Authentication and security tests**:
- ✅ **Auth Credentials Login**: Tests login with API credentials
- ✅ **Auth Flow Validation**: Validates authentication workflows
- ✅ **Auth Rate Limiting**: Tests rate limit handling
- ✅ **Auth Flow Mock**: Tests mocked authentication scenarios

### 4. Stagehand Tests (Multiple `.spec.ts` files)
**Advanced testing with Stagehand framework**:
- ✅ **API Trading**: Tests trading API endpoints
- ✅ **Pattern Discovery**: Tests pattern detection functionality
- ✅ **Safety Checks**: Tests safety and risk management
- ✅ **Critical Flows**: Tests critical trading workflows

## 🚀 Quick Start

### Prerequisites
- Node.js 20.11+
- Bun runtime
- Docker (for TestContainers)
- Development server running on localhost:3008

### Running the Main Demonstration
```bash
# Run the primary real data paper trading test
bun test tests/e2e/real-data-paper-trading.test.ts --timeout=45000

# Run the simplified bot demonstration
bun test tests/e2e/simplified-bot-demonstration.test.ts --timeout=30000
```

### Running All E2E Tests
```bash
# Run all E2E tests
bun test tests/e2e/ --timeout=60000
```

## 📊 Real Data Paper Trading Results

The main test demonstrates the bot working with **real MEXC data**:

```
📅 Real MEXC Calendar Data Retrieved:
   ✅ Success: true
   ✅ Total Listings: 158
   ✅ Data Source: Real MEXC API
   ✅ Timestamp: 2025-09-13T21:05:46.421Z

📈 Selected Real Trading Opportunity:
   1. DPENGU - DPENGU
      VCoin ID: 73e23a90c7b04375a6e4984a7907bbbb
      Confidence: 74.7% | Risk: high
      Open Time: 2025-09-14T07:00:00.000Z
      Time Until Open: 594 minutes
      Status: pending
```

## 🛡️ Paper Trading Safety

### Key Safety Features
- **No Real Money at Risk**: All trades are simulated
- **Real Market Data**: Uses actual MEXC prices and conditions
- **Perfect for Testing**: Safe environment to test with real data
- **Ready for Live Trading**: Can be switched to live mode when ready

### Paper Trading vs Live Trading
| Feature | Paper Trading | Live Trading |
|---------|---------------|--------------|
| **Market Data** | Real MEXC data | Real MEXC data |
| **Trade Execution** | Simulated | Real orders |
| **Money at Risk** | None | Real funds |
| **Order IDs** | Simulated | Real exchange IDs |
| **Performance** | Simulated P&L | Real P&L |

## 🔧 Test Environment

### Database Setup
Tests use TestContainers with PostgreSQL:
- Isolated test database for each test run
- Automatic cleanup after tests complete
- Real database operations with test data

### API Integration
Tests use real MEXC API endpoints:
- `/api/mexc/calendar` - Real upcoming listings
- `/api/mexc/connectivity` - Real connectivity status
- `/api/health/system` - Real system health
- `/api/workflow-status` - Real workflow status

## 📈 Expected Results

### Successful Test Run
When tests pass, you should see:
```
🎉 REAL DATA PAPER TRADING DEMONSTRATION COMPLETE!
✅ The MEXC Sniper Bot with Real Data is FULLY OPERATIONAL!
🚀 The bot is ready for live trading when confidence is built!
```

### Test Metrics
- **Real Data Integration**: 100% operational
- **Paper Trading Mode**: Safe simulation enabled
- **System Health**: All systems healthy
- **MEXC Connectivity**: Connected and operational
- **Automation Features**: All features working

## 🐛 Troubleshooting

### Common Issues

#### Development Server Not Running
```bash
# Start the development server
make dev
# or
bun run dev
```

#### Database Connection Errors
```bash
# Ensure TestContainers is running
docker ps | grep postgres

# Check database configuration
echo $DATABASE_URL
```

#### Test Timeouts
```bash
# Increase timeout for slow systems
bun test tests/e2e/ --timeout=120000
```

## 📝 Test Documentation

### Real Data Paper Trading Explanation
See `REAL_DATA_PAPER_TRADING_EXPLANATION.md` for detailed explanation of how the bot uses real MEXC data for paper trading demonstrations.

## 🎯 Success Criteria

The bot is considered "working as expected" when:
- ✅ All E2E tests pass
- ✅ Real MEXC data integration works
- ✅ Paper trading mode operates safely
- ✅ System health is verified
- ✅ MEXC connectivity is established
- ✅ All automation features are operational

## 🔄 Continuous Integration

### GitHub Actions
The E2E tests are designed to run in CI/CD pipelines:
```yaml
- name: Run E2E Tests
  run: bun test tests/e2e/ --timeout=60000
```

---

**Note**: These E2E tests demonstrate the bot working with real MEXC data in a safe paper trading environment. They validate that the bot is ready for production use with actual market data.