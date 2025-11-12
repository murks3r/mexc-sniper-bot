/**
 * Fallback Strategy Manager
 *
 * Implements fallback patterns with caching support
 */

export type FallbackStrategy<T> = () => Promise<T>;

export interface FallbackConfig<T> {
  strategies: FallbackStrategy<T>[];
  timeout: number;
  enableCaching: boolean;
  cacheKey?: string;
  cacheTtl?: number;
}

export class FallbackManager {
  private static cache = new Map<string, { value: any; expiry: number }>();

  static async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    config: FallbackConfig<T>,
  ): Promise<T> {
    const { strategies, timeout, enableCaching, cacheKey, cacheTtl = 60000 } = config;

    try {
      const result = await Promise.race([
        primaryOperation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Primary operation timeout")), timeout);
        }),
      ]);

      if (enableCaching && cacheKey) {
        FallbackManager.cache.set(cacheKey, {
          value: result,
          expiry: Date.now() + cacheTtl,
        });
      }

      return result;
    } catch (primaryError) {
      for (let i = 0; i < strategies.length; i++) {
        try {
          const result = await strategies[i]();
          return result;
        } catch (_fallbackError) {}
      }

      if (enableCaching && cacheKey) {
        const cached = FallbackManager.cache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
          return cached.value;
        }
      }

      throw new Error(`All fallback strategies failed. Primary error: ${primaryError.message}`);
    }
  }

  static clearCache(): void {
    FallbackManager.cache.clear();
  }

  static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: FallbackManager.cache.size,
      keys: Array.from(FallbackManager.cache.keys()),
    };
  }
}
