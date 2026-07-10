/**
 * In-memory cache system with TTL support
 */

export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5 minutes
  MEDIUM: 15 * 60 * 1000, // 15 minutes
  LONG: 60 * 60 * 1000, // 1 hour
  VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours
};

export const CACHE_KEYS = {
  USER_BY_ID: (id: number) => `user:${id}`,
  USER_PERMISSIONS: (userId: number) => `user:permissions:${userId}`,
  USER_STATS: "user:stats",
  SUPPLIER_BY_ID: (id: number) => `supplier:${id}`,
  SUPPLIER_METRICS: (id: number) => `supplier:metrics:${id}`,
  SUPPLIER_STATS: "supplier:stats",
  PRODUCT_BY_ID: (id: number) => `product:${id}`,
  QUOTATION_BY_ID: (id: number) => `quotation:${id}`,
  PROPOSAL_BY_ID: (id: number) => `proposal:${id}`,
  EDITAL_BY_ID: (id: number) => `edital:${id}`,
  EQUIVALENCIA_CACHE: "equivalencia:cache",
  PRICING_TABLE_BY_ID: (id: number) => `pricing:${id}`,
  SUPPLIERS_LIST: "suppliers:list",
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache {
  private store: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set value in cache with TTL
   */
  set<T>(key: string, value: T, ttl: number = CACHE_TTL.MEDIUM): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Delete multiple keys matching pattern
   */
  deletePattern(pattern: string | RegExp): number {
    let deleted = 0;
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.store.size,
      entries: Array.from(this.store.entries()).map(([key, entry]) => ({
        key,
        expiresIn: Math.max(0, entry.expiresAt - Date.now()),
      })),
    };
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Export singleton instance
export const cache = new Cache();
