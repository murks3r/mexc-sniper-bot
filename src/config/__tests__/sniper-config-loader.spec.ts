/**
 * SniperConfigLoader Tests
 *
 * Validates schema (Ajv/Zod), env override precedence, hot reload.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SniperConfigLoader } from "../sniper-config-loader";

const TEST_CONFIG_DIR = join(process.cwd(), "test-config");

describe("SniperConfigLoader", () => {
  beforeEach(() => {
    // Create test config directory if it doesn't exist
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
    // Clean up test config file
    const configPath = join(TEST_CONFIG_DIR, "sniper-config.json");
    if (existsSync(configPath)) {
      try {
        unlinkSync(configPath);
      } catch {
        // Ignore
      }
    }
    // Reset env vars
    delete process.env.SNIPER_MAX_CONCURRENT_REQUESTS;
    delete process.env.SNIPER_REQUEST_TIMEOUT;
    delete process.env.SNIPER_ENABLED;
  });

  afterEach(() => {
    // Clean up
    const configPath = join(TEST_CONFIG_DIR, "sniper-config.json");
    if (existsSync(configPath)) {
      try {
        unlinkSync(configPath);
      } catch {
        // Ignore
      }
    }
    delete process.env.SNIPER_MAX_CONCURRENT_REQUESTS;
    delete process.env.SNIPER_REQUEST_TIMEOUT;
    delete process.env.SNIPER_ENABLED;
  });

  describe("schema validation", () => {
    it("should reject invalid config schema", () => {
      const invalidConfig = {
        maxConcurrentRequests: "not-a-number",
        requestTimeout: -100,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(invalidConfig));

      expect(() => {
        new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"));
      }).toThrow(/invalid.*config/i);
    });

    it("should accept valid config schema", () => {
      const validConfig = {
        maxConcurrentRequests: 5,
        requestTimeout: 5000,
        enabled: true,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
        },
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(validConfig));

      expect(() => {
        const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"));
        const config = loader.getConfig();
        expect(config.maxConcurrentRequests).toBe(5);
        expect(config.requestTimeout).toBe(5000);
        expect(config.enabled).toBe(true);
      }).not.toThrow();
    });

    it("should apply default values for missing fields", () => {
      const minimalConfig = {
        enabled: true,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(minimalConfig));

      const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"));
      const config = loader.getConfig();

      expect(config.maxConcurrentRequests).toBeGreaterThan(0);
      expect(config.requestTimeout).toBeGreaterThan(0);
    });
  });

  describe("environment variable override", () => {
    it("should override config values with environment variables", () => {
      const config = {
        maxConcurrentRequests: 5,
        requestTimeout: 5000,
        enabled: true,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(config));

      process.env.SNIPER_MAX_CONCURRENT_REQUESTS = "10";
      process.env.SNIPER_REQUEST_TIMEOUT = "10000";
      process.env.SNIPER_ENABLED = "false";

      const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"));
      const loadedConfig = loader.getConfig();

      expect(loadedConfig.maxConcurrentRequests).toBe(10);
      expect(loadedConfig.requestTimeout).toBe(10000);
      expect(loadedConfig.enabled).toBe(false);
    });

    it("should prioritize env vars over config file", () => {
      const config = {
        maxConcurrentRequests: 5,
        requestTimeout: 5000,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(config));

      process.env.SNIPER_MAX_CONCURRENT_REQUESTS = "20";

      const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"));
      const loadedConfig = loader.getConfig();

      expect(loadedConfig.maxConcurrentRequests).toBe(20);
      // requestTimeout should come from config file
      expect(loadedConfig.requestTimeout).toBe(5000);
    });
  });

  describe("hot reload", () => {
    it("should reload config when file changes", async () => {
      const initialConfig = {
        maxConcurrentRequests: 5,
        requestTimeout: 5000,
        enabled: true,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(initialConfig));

      const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"), {
        watch: true,
      });

      expect(loader.getConfig().maxConcurrentRequests).toBe(5);

      // Update config file
      const updatedConfig = {
        ...initialConfig,
        maxConcurrentRequests: 15,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(updatedConfig));

      // Wait for file system event
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reload should pick up changes
      loader.reload();
      expect(loader.getConfig().maxConcurrentRequests).toBe(15);
    });

    it("should handle file deletion gracefully", async () => {
      const config = {
        maxConcurrentRequests: 5,
        requestTimeout: 5000,
      };

      writeFileSync(join(TEST_CONFIG_DIR, "sniper-config.json"), JSON.stringify(config));

      const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "sniper-config.json"), {
        watch: true,
      });

      const initialConfig = loader.getConfig();
      expect(initialConfig.maxConcurrentRequests).toBe(5);

      // Delete config file
      unlinkSync(join(TEST_CONFIG_DIR, "sniper-config.json"));

      // Should fall back to defaults or last known config
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not throw, but may use defaults
      expect(() => loader.getConfig()).not.toThrow();
    });
  });

  describe("config file not found", () => {
    it("should use defaults when config file does not exist", () => {
      const loader = new SniperConfigLoader(join(TEST_CONFIG_DIR, "non-existent-config.json"));

      const config = loader.getConfig();
      expect(config).toBeDefined();
      expect(config.maxConcurrentRequests).toBeGreaterThan(0);
      expect(config.requestTimeout).toBeGreaterThan(0);
    });
  });
});
