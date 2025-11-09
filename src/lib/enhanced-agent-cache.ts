/**
 * Enhanced Agent Cache
 * Minimal implementation for build optimization
 */

export interface AgentCacheEntry {
  agentId: string;
  data: any;
  timestamp: number;
  ttl: number;
  lastAccessed: number;
  accessCount: number;
}

export interface AgentCacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
}

// Interface for the enhanced agent response (compatible with common-interfaces)
export interface EnhancedAgentResponse {
  success: boolean;
  data: any;
  content: string;
  timestamp: number;
  processingTime: number;
  confidence: number;
  reasoning: string;
  metadata: Record<string, any>;
}

// Interface for set options
export interface SetAgentResponseOptions {
  ttl?: number;
  priority?: "low" | "medium" | "high";
  dependencies?: string[];
}

class EnhancedAgentCache {
  private cache: Map<string, AgentCacheEntry> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };
  private defaultTtl = 10 * 60 * 1000; // 10 minutes
  private maxSize = 500;

  set(key: string, data: any, agentId: string, ttl?: number): void {
    // Cleanup if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const entry: AgentCacheEntry = {
      agentId,
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      lastAccessed: Date.now(),
      accessCount: 0,
    };

    this.cache.set(key, entry);
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.stats.hits++;

    return entry.data;
  }

  /**
   * Get agent response with enhanced compatibility for BaseAgent
   */
  async getAgentResponse(
    agentName: string,
    input: string,
    context?: Record<string, any>,
  ): Promise<EnhancedAgentResponse | null> {
    const cacheKey = this.generateAgentCacheKey(agentName, input, context);
    const cached = this.get(cacheKey);

    if (cached) {
      return cached as EnhancedAgentResponse;
    }

    return null;
  }

  /**
   * Set agent response with enhanced compatibility for BaseAgent
   */
  async setAgentResponse(
    agentName: string,
    input: string,
    response: EnhancedAgentResponse,
    context?: Record<string, any>,
    options?: SetAgentResponseOptions,
  ): Promise<void> {
    const cacheKey = this.generateAgentCacheKey(agentName, input, context);
    const ttl = options?.ttl || this.defaultTtl;

    this.set(cacheKey, response, agentName, ttl);
  }

  /**
   * Track cache miss for statistics
   */
  async trackCacheMiss(agentName: string): Promise<void> {
    // This is called when there's a cache miss
    // The actual miss tracking is already handled in the get() method
    // This method exists for API compatibility
    console.debug(`[EnhancedAgentCache] Cache miss tracked for agent: ${agentName}`);
  }

  /**
   * Generate cache key for agent responses
   */
  private generateAgentCacheKey(
    agentName: string,
    input: string,
    context?: Record<string, any>,
  ): string {
    const contextStr = context ? JSON.stringify(context) : "";
    return `agent:${agentName}:${this.hashString(input + contextStr)}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clearAgentCache(agentId: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.agentId === agentId) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  getStats(): AgentCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      missRate: total > 0 ? (this.stats.misses / total) * 100 : 0,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
    };
  }

  getAgentEntries(agentId: string): string[] {
    const keys: string[] = [];
    for (const [key, entry] of this.cache) {
      if (entry.agentId === agentId) {
        keys.push(key);
      }
    }
    return keys;
  }

  private evictLeastRecentlyUsed(): void {
    let lruKey: string | undefined;
    let oldestAccess = Number.MAX_SAFE_INTEGER;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  setMaxSize(size: number): void {
    this.maxSize = size;
  }

  setDefaultTtl(ttl: number): void {
    this.defaultTtl = ttl;
  }
}

export const enhancedAgentCache = new EnhancedAgentCache();

// Export alias for compatibility
export const globalEnhancedAgentCache = enhancedAgentCache;

// Initialize agent cache function
export async function initializeAgentCache(config?: {
  maxSize?: number;
  defaultTtl?: number;
}): Promise<EnhancedAgentCache> {
  if (config?.maxSize) {
    enhancedAgentCache.setMaxSize(config.maxSize);
  }
  if (config?.defaultTtl) {
    enhancedAgentCache.setDefaultTtl(config.defaultTtl);
  }
  return enhancedAgentCache;
}
