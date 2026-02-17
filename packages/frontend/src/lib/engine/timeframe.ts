import type { Bar, Timeframe } from '$shared/types';
import { TIMEFRAME_TO_MS } from '$shared/types';

function bucketStart(timestamp: number, bucketMs: number): number {
  return Math.floor(timestamp / bucketMs) * bucketMs;
}

export function aggregateBarsByTimeframe(bars: Bar[], timeframe: Timeframe): Bar[] {
  if (timeframe === 'M1') return bars;
  if (bars.length === 0) return [];

  const bucketMs = TIMEFRAME_TO_MS[timeframe];
  const aggregated: Bar[] = [];

  let currentBucket = bucketStart(bars[0].timestamp, bucketMs);
  let current: Bar = {
    timestamp: currentBucket,
    open: bars[0].open,
    high: bars[0].high,
    low: bars[0].low,
    close: bars[0].close,
    volume: bars[0].volume ?? 0
  };

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const nextBucket = bucketStart(bar.timestamp, bucketMs);

    if (nextBucket !== currentBucket) {
      aggregated.push(current);
      currentBucket = nextBucket;
      current = {
        timestamp: currentBucket,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0
      };
      continue;
    }

    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume = (current.volume ?? 0) + (bar.volume ?? 0);
  }

  aggregated.push(current);
  return aggregated;
}
