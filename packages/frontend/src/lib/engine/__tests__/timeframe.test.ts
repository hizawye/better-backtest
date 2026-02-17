import { describe, expect, test } from 'bun:test';
import { aggregateBarsByTimeframe } from '../timeframe';

describe('timeframe aggregation', () => {
  test('aggregates 5 one-minute bars into one M5 bar', () => {
    const base = 1_700_000_000_000;
    const start = Math.floor(base / 300_000) * 300_000;
    const bars = Array.from({ length: 5 }).map((_, index) => ({
      timestamp: start + index * 60_000,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      volume: 10
    }));

    const result = aggregateBarsByTimeframe(bars, 'M5');
    expect(result.length).toBe(1);
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(104.5);
    expect(result[0].high).toBe(105);
    expect(result[0].low).toBe(99);
    expect(result[0].volume).toBe(50);
  });
});
