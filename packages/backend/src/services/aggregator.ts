import type { Bar } from '../../../shared/types';
import * as alphaVantage from '../adapters/alpha-vantage';
import * as forexRate from '../adapters/forexrate';
import { getCached, setCache } from './cache';

const providers = [
  { name: 'AlphaVantage', fetch: alphaVantage.fetchBars },
  { name: 'ForexRateAPI', fetch: forexRate.fetchBars },
];

export async function fetchBars(
  pair: string,
  from: number,
  to: number
): Promise<Bar[]> {
  const cacheKey = `bars:${pair}:${from}:${to}`;
  const startTime = Date.now();

  // Try cache first
  const cached = await getCached<Bar[]>(cacheKey);
  if (cached) {
    console.log(`✓ Cache hit for ${pair} (${cached.length} bars)`);
    return cached;
  }

  console.log(`⚡ Fetching ${pair} from providers...`);

  // Try each provider with timeout
  const PROVIDER_TIMEOUT = 12000; // 12s per provider

  for (const provider of providers) {
    try {
      const providerStart = Date.now();
      console.log(`→ Trying ${provider.name}...`);

      const barsPromise = provider.fetch(pair, from, to);
      const timeoutPromise = new Promise<Bar[]>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after 12s`)), PROVIDER_TIMEOUT)
      );

      const bars = await Promise.race([barsPromise, timeoutPromise]);
      const elapsed = Date.now() - providerStart;

      if (bars.length > 0) {
        console.log(`✓ ${provider.name} returned ${bars.length} bars in ${elapsed}ms`);
        // Cache for 24 hours
        await setCache(cacheKey, bars, 86400);
        return bars;
      }
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ ${provider.name} failed after ${elapsed}ms: ${errorMsg}`);
      // Continue to next provider
    }
  }

  throw new Error(`All data providers failed for ${pair}`);
}
