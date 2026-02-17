import { describe, expect, test } from 'bun:test';
import { buildChartEntryIntent, deriveRiskSide } from '../chart-entry';

describe('chart entry risk tool', () => {
  test('derives buy when stop is below entry', () => {
    expect(deriveRiskSide(100, 95)).toBe('buy');
    expect(deriveRiskSide(100, 105)).toBe('sell');
  });

  test('uses replay market context for market entries', () => {
    const intent = buildChartEntryIntent({
      draft: {
        entry: { timestamp: 1_600_000_000_000, price: 120 },
        stop: { timestamp: 1_600_000_050_000, price: 110 },
        side: 'buy',
        createdAt: 1_700_000_000_000
      },
      orderMode: 'market',
      market: {
        bid: 200,
        ask: 201,
        timestamp: 1_800_000_000_000
      },
      pair: 'NAS100'
    });

    expect(intent.entryPrice).toBe(201);
    expect(intent.createdAt).toBe(1_800_000_000_000);
  });

  test('keeps chart-selected price for limit or stop entries', () => {
    const limitIntent = buildChartEntryIntent({
      draft: {
        entry: { timestamp: 1_000, price: 150 },
        stop: { timestamp: 2_000, price: 140 },
        side: 'buy',
        createdAt: 3_000
      },
      orderMode: 'limit',
      market: {
        bid: 300,
        ask: 301,
        timestamp: 9_999
      },
      pair: 'NAS100'
    });

    const stopIntent = buildChartEntryIntent({
      draft: {
        entry: { timestamp: 1_000, price: 80 },
        stop: { timestamp: 2_000, price: 90 },
        side: 'sell',
        createdAt: 3_000
      },
      orderMode: 'stop',
      market: {
        bid: 70,
        ask: 71,
        timestamp: 10_000
      },
      pair: 'NAS100'
    });

    expect(limitIntent.entryPrice).toBe(150);
    expect(stopIntent.entryPrice).toBe(80);
  });
});
