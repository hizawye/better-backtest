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

  // Try cache first
  const cached = await getCached<Bar[]>(cacheKey);
  if (cached) {
    console.log(`Cache hit for ${cacheKey}`);
    return cached;
  }

  // Try each provider in order
  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name} for ${pair}...`);
      const bars = await provider.fetch(pair, from, to);

      if (bars.length > 0) {
        console.log(`${provider.name} returned ${bars.length} bars`);
        // Cache for 24 hours
        await setCache(cacheKey, bars, 86400);
        return bars;
      }
    } catch (error) {
      console.error(`${provider.name} failed:`, error);
      // Continue to next provider
    }
  }

  throw new Error(`All data providers failed for ${pair}`);
}
