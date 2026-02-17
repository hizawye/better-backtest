import { Hono } from 'hono';
import { fetchBars } from '../services/aggregator';
import type { Bar } from '../../../shared/types';

const app = new Hono();
const VALID_TIMEFRAMES = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'] as const;

function timeframeToMs(timeframe: (typeof VALID_TIMEFRAMES)[number]): number {
  switch (timeframe) {
    case 'M1':
      return 60_000;
    case 'M5':
      return 5 * 60_000;
    case 'M15':
      return 15 * 60_000;
    case 'H1':
      return 60 * 60_000;
    case 'H4':
      return 4 * 60 * 60_000;
    case 'D1':
      return 24 * 60 * 60_000;
  }
}

function aggregateBars(bars: Bar[], timeframe: (typeof VALID_TIMEFRAMES)[number]): Bar[] {
  if (timeframe === 'M1') return bars;
  const frameMs = timeframeToMs(timeframe);
  const sorted = [...bars].sort((a, b) => a.timestamp - b.timestamp);
  const out: Bar[] = [];
  let bucketStart = 0;
  let current: Bar | null = null;

  for (const bar of sorted) {
    const currentBucket = Math.floor(bar.timestamp / frameMs) * frameMs;
    if (!current || currentBucket !== bucketStart) {
      if (current) out.push(current);
      bucketStart = currentBucket;
      current = {
        timestamp: currentBucket,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      };
      continue;
    }

    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume = (current.volume || 0) + (bar.volume || 0);
  }

  if (current) out.push(current);
  return out;
}

function normalizePair(pair: string): string {
  return pair === 'NSXUSD' ? 'NAS100' : pair;
}

app.get('/:pair/:from/:to', async (c) => {
  try {
    const requestedPair = c.req.param('pair').toUpperCase();
    const pair = normalizePair(requestedPair);
    const from = parseInt(c.req.param('from'));
    const to = parseInt(c.req.param('to'));
    const timeframe = (c.req.query('timeframe') || 'M1').toUpperCase();
    const sessionId = c.req.query('sessionId') || '';

    // Validate inputs
    if (!pair || isNaN(from) || isNaN(to)) {
      return c.json({ error: 'Invalid parameters' }, 400);
    }

    if (!VALID_TIMEFRAMES.includes(timeframe as (typeof VALID_TIMEFRAMES)[number])) {
      return c.json({ error: `Unsupported timeframe. Valid options: ${VALID_TIMEFRAMES.join(', ')}` }, 400);
    }

    const validPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'NAS100', 'US500', 'NSXUSD'];
    if (!validPairs.includes(requestedPair)) {
      return c.json({ error: `Unsupported instrument. Valid options: ${validPairs.join(', ')}` }, 400);
    }

    // Reject excessive date ranges
    const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    const MAX_DAYS = 30;

    if (daysDiff > MAX_DAYS) {
      return c.json({
        error: `Date range too large: ${daysDiff} days requested, max ${MAX_DAYS} days allowed`
      }, 400);
    }

    if (from >= to) {
      return c.json({ error: 'Invalid date range: from must be before to' }, 400);
    }

    // Add request timeout
    const REQUEST_TIMEOUT = 35000; // 35s total
    const fetchPromise = fetchBars(pair, from, to);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 35s')), REQUEST_TIMEOUT)
    );

    const bars = await Promise.race([fetchPromise, timeoutPromise]);
    const aggregatedBars = aggregateBars(bars, timeframe as (typeof VALID_TIMEFRAMES)[number]);

    return c.json({
      pair,
      requestedPair,
      sessionId,
      timeframe,
      from,
      to,
      count: aggregatedBars.length,
      bars: aggregatedBars,
    });
  } catch (error) {
    console.error('Data route error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
});

export default app;
