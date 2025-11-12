/**
 * Risk Defaults Tests
 *
 * Unit tests for risk parameter resolution logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveRiskParamsSync,
  type ResolveRiskParamsInput,
} from "./risk-defaults";
import { defaultRiskConfig } from "./risk-defaults-config";

describe("Risk Defaults Resolution", () => {
  describe("resolveRiskParamsSync", () => {
    it("should use explicit values when provided and valid", () => {
      const input: ResolveRiskParamsInput = {
        stopLossPercent: 10,
        takeProfitLevel: 3,
        takeProfitCustom: 30,
      };

      const result = resolveRiskParamsSync(input);

      expect(result.stopLossPercent).toBe(10);
      expect(result.takeProfitLevel).toBe(3);
      expect(result.takeProfitCustom).toBe(30);
      expect(result.takeProfitPercent).toBe(30); // Should use custom when provided
    });

    it("should clamp stopLossPercent to valid range", () => {
      const inputTooLow: ResolveRiskParamsInput = {
        stopLossPercent: 0.5, // Below minimum
      };
      const inputTooHigh: ResolveRiskParamsInput = {
        stopLossPercent: 60, // Above maximum
      };

      const resultLow = resolveRiskParamsSync(inputTooLow);
      const resultHigh = resolveRiskParamsSync(inputTooHigh);

      expect(resultLow.stopLossPercent).toBe(defaultRiskConfig.minStopLossPercent);
      expect(resultHigh.stopLossPercent).toBe(defaultRiskConfig.maxStopLossPercent);
    });

    it("should clamp takeProfitCustom to valid range", () => {
      const inputTooLow: ResolveRiskParamsInput = {
        takeProfitCustom: 0.5, // Below minimum
      };
      const inputTooHigh: ResolveRiskParamsInput = {
        takeProfitCustom: 150, // Above maximum
      };

      const resultLow = resolveRiskParamsSync(inputTooLow);
      const resultHigh = resolveRiskParamsSync(inputTooHigh);

      expect(resultLow.takeProfitCustom).toBe(defaultRiskConfig.minTakeProfitPercent);
      expect(resultHigh.takeProfitCustom).toBe(defaultRiskConfig.maxTakeProfitPercent);
    });

    it("should use user preferences when no explicit values provided", () => {
      const userPrefs = {
        stopLossPercent: 8,
        takeProfitLevel1: 5,
        takeProfitLevel2: 12,
        takeProfitLevel3: 18,
        takeProfitLevel4: 30,
        defaultTakeProfitLevel: 2,
        takeProfitCustom: null,
      };

      const result = resolveRiskParamsSync({}, userPrefs);

      expect(result.stopLossPercent).toBe(8);
      expect(result.takeProfitLevel).toBe(2);
      expect(result.takeProfitPercent).toBe(12); // Should use level 2 from user prefs
    });

    it("should use global defaults when no input or user preferences", () => {
      const result = resolveRiskParamsSync({});

      expect(result.stopLossPercent).toBe(defaultRiskConfig.defaultStopLossPercent);
      expect(result.takeProfitLevel).toBe(defaultRiskConfig.defaultTakeProfitLevel);
      expect(result.takeProfitPercent).toBe(
        defaultRiskConfig.defaultTakeProfitLadder[defaultRiskConfig.defaultTakeProfitLevel === 1
          ? "L1"
          : defaultRiskConfig.defaultTakeProfitLevel === 2
            ? "L2"
            : defaultRiskConfig.defaultTakeProfitLevel === 3
              ? "L3"
              : "L4"],
      );
    });

    it("should prioritize explicit values over user preferences", () => {
      const input: ResolveRiskParamsInput = {
        stopLossPercent: 12,
        takeProfitLevel: 4,
      };

      const userPrefs = {
        stopLossPercent: 8,
        takeProfitLevel1: 5,
        takeProfitLevel2: 12,
        takeProfitLevel3: 18,
        takeProfitLevel4: 30,
        defaultTakeProfitLevel: 2,
        takeProfitCustom: null,
      };

      const result = resolveRiskParamsSync(input, userPrefs);

      expect(result.stopLossPercent).toBe(12); // Explicit value
      expect(result.takeProfitLevel).toBe(4); // Explicit value
      expect(result.takeProfitPercent).toBe(30); // Should use level 4 from user prefs
    });

    it("should handle invalid takeProfitLevel by using default", () => {
      const inputInvalid: ResolveRiskParamsInput = {
        takeProfitLevel: 5, // Invalid (must be 1-4)
      };
      const inputNegative: ResolveRiskParamsInput = {
        takeProfitLevel: -1, // Invalid
      };

      const resultInvalid = resolveRiskParamsSync(inputInvalid);
      const resultNegative = resolveRiskParamsSync(inputNegative);

      expect(resultInvalid.takeProfitLevel).toBe(defaultRiskConfig.defaultTakeProfitLevel);
      expect(resultNegative.takeProfitLevel).toBe(defaultRiskConfig.defaultTakeProfitLevel);
    });

    it("should use takeProfitCustom when provided, even if level is specified", () => {
      const input: ResolveRiskParamsInput = {
        takeProfitLevel: 2,
        takeProfitCustom: 35,
      };

      const result = resolveRiskParamsSync(input);

      expect(result.takeProfitCustom).toBe(35);
      expect(result.takeProfitPercent).toBe(35); // Should use custom over level
    });

    it("should map takeProfitLevel to correct percentage from user ladder", () => {
      const userPrefs = {
        stopLossPercent: 10,
        takeProfitLevel1: 7,
        takeProfitLevel2: 14,
        takeProfitLevel3: 21,
        takeProfitLevel4: 35,
        defaultTakeProfitLevel: 2,
        takeProfitCustom: null,
      };

      const level1 = resolveRiskParamsSync({ takeProfitLevel: 1 }, userPrefs);
      const level2 = resolveRiskParamsSync({ takeProfitLevel: 2 }, userPrefs);
      const level3 = resolveRiskParamsSync({ takeProfitLevel: 3 }, userPrefs);
      const level4 = resolveRiskParamsSync({ takeProfitLevel: 4 }, userPrefs);

      expect(level1.takeProfitPercent).toBe(7);
      expect(level2.takeProfitPercent).toBe(14);
      expect(level3.takeProfitPercent).toBe(21);
      expect(level4.takeProfitPercent).toBe(35);
    });

    it("should fall back to global ladder when user prefs missing level", () => {
      const userPrefs = {
        stopLossPercent: 10,
        takeProfitLevel1: 7,
        // Missing level 2-4
        defaultTakeProfitLevel: 2,
        takeProfitCustom: null,
      };

      const result = resolveRiskParamsSync({ takeProfitLevel: 2 }, userPrefs);

      // Should use global default for level 2
      expect(result.takeProfitPercent).toBe(defaultRiskConfig.defaultTakeProfitLadder.L2);
    });

    it("should handle null and undefined values correctly", () => {
      const inputNull: ResolveRiskParamsInput = {
        stopLossPercent: null,
        takeProfitLevel: null,
        takeProfitCustom: null,
      };

      const inputUndefined: ResolveRiskParamsInput = {
        stopLossPercent: undefined,
        takeProfitLevel: undefined,
        takeProfitCustom: undefined,
      };

      const resultNull = resolveRiskParamsSync(inputNull);
      const resultUndefined = resolveRiskParamsSync(inputUndefined);

      // Both should use defaults
      expect(resultNull.stopLossPercent).toBe(defaultRiskConfig.defaultStopLossPercent);
      expect(resultUndefined.stopLossPercent).toBe(defaultRiskConfig.defaultStopLossPercent);
    });

    it("should handle NaN values by using defaults", () => {
      const input: ResolveRiskParamsInput = {
        stopLossPercent: Number.NaN,
        takeProfitLevel: Number.NaN,
        takeProfitCustom: Number.NaN,
      };

      const result = resolveRiskParamsSync(input);

      expect(result.stopLossPercent).toBe(defaultRiskConfig.defaultStopLossPercent);
      expect(result.takeProfitLevel).toBe(defaultRiskConfig.defaultTakeProfitLevel);
      expect(result.takeProfitCustom).toBeNull();
    });
  });

  describe("defaultRiskConfig", () => {
    it("should have valid default values", () => {
      expect(defaultRiskConfig.defaultStopLossPercent).toBeGreaterThan(0);
      expect(defaultRiskConfig.defaultStopLossPercent).toBeLessThanOrEqual(50);
      expect(defaultRiskConfig.minStopLossPercent).toBeLessThan(
        defaultRiskConfig.maxStopLossPercent,
      );
      expect(defaultRiskConfig.minTakeProfitPercent).toBeLessThan(
        defaultRiskConfig.maxTakeProfitPercent,
      );
      expect(defaultRiskConfig.defaultTakeProfitLevel).toBeGreaterThanOrEqual(1);
      expect(defaultRiskConfig.defaultTakeProfitLevel).toBeLessThanOrEqual(4);
    });

    it("should have take profit ladder with increasing values", () => {
      const ladder = defaultRiskConfig.defaultTakeProfitLadder;
      expect(ladder.L1).toBeLessThan(ladder.L2);
      expect(ladder.L2).toBeLessThan(ladder.L3);
      expect(ladder.L3).toBeLessThan(ladder.L4);
    });
  });
});

