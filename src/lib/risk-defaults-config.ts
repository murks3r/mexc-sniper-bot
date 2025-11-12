/**
 * Risk Defaults Configuration (Client-Safe)
 *
 * This file contains only the configuration constants that can be safely
 * imported in client-side code. Database-dependent functions are in risk-defaults.ts
 */

/**
 * Default Risk Configuration
 * Global defaults used when no user preferences are available
 */
export interface DefaultRiskConfig {
  defaultStopLossPercent: number;
  defaultTakeProfitLadder: {
    L1: number;
    L2: number;
    L3: number;
    L4: number;
  };
  minStopLossPercent: number;
  maxStopLossPercent: number;
  minTakeProfitPercent: number;
  maxTakeProfitPercent: number;
  defaultTakeProfitLevel: number;
}

export const defaultRiskConfig: DefaultRiskConfig = {
  defaultStopLossPercent: 15,
  defaultTakeProfitLadder: {
    L1: 15,
    L2: 25,
    L3: 40,
    L4: 50,
  },
  minStopLossPercent: 1,
  maxStopLossPercent: 50,
  minTakeProfitPercent: 1,
  maxTakeProfitPercent: 100,
  defaultTakeProfitLevel: 2,
};
