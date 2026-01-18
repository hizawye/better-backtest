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

  // Try all providers in parallel
  const PROVIDER_TIMEOUT = 15000; // 15s per provider

  // Create all provider promises upfront
  const providerPromises = providers.map(async (provider) => {
    const providerStart = Date.now();
    console.log(`→ Trying ${provider.name}...`);

    try {
      const barsPromise = provider.fetch(pair, from, to);
      const timeoutPromise = new Promise<Bar[]>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after 15s`)), PROVIDER_TIMEOUT)
      );

      const bars = await Promise.race([barsPromise, timeoutPromise]);
      const elapsed = Date.now() - providerStart;

      if (bars.length > 0) {
        console.log(`✓ ${provider.name} returned ${bars.length} bars in ${elapsed}ms`);
        return { success: true, bars, provider: provider.name };
      }
      return { success: false, error: 'No bars returned', provider: provider.name };
    } catch (error) {
      const elapsed = Date.now() - providerStart;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ ${provider.name} failed after ${elapsed}ms: ${errorMsg}`);
      return { success: false, error: errorMsg, provider: provider.name };
    }
  });

  // Run all providers in parallel, use first success
  const results = await Promise.all(providerPromises);
  const successfulResult = results.find(r => r.success);

  if (successfulResult && 'bars' in successfulResult) {
    await setCache(cacheKey, successfulResult.bars, 86400);
    return successfulResult.bars;
  }

  // All failed - show all errors
  const errors = results.map(r => `${r.provider}: ${r.error || 'failed'}`).join('; ');
  throw new Error(`All providers failed - ${errors}`);
}
