const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`providers-page:cache:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(`providers-page:cache:${key}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(`providers-page:cache:${key}`, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable
  }
}
