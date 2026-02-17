import { describe, expect, test } from 'bun:test';
import { createPendingOrder, evaluateStopsOnBar, tryFillOrderOnBar } from '../execution';

describe('execution engine', () => {
  test('fills buy limit when bar low crosses limit price', () => {
    const order = createPendingOrder({
      sessionId: 's1',
      type: 'limit',
      side: 'buy',
      size: 1,
      createdAt: 1,
      price: 100
    });

    const fill = tryFillOrderOnBar(
      order,
      { timestamp: 2, open: 102, high: 103, low: 99, close: 101 },
      2,
      2,
      0
    );

    expect(fill).not.toBeNull();
    expect(fill?.position.side).toBe('buy');
    expect(fill?.order.status).toBe('filled');
    expect(fill?.order.filledPrice).toBe(100);
  });

  test('fills sell stop when bar low hits stop price', () => {
    const order = createPendingOrder({
      sessionId: 's2',
      type: 'stop',
      side: 'sell',
      size: 0.5,
      createdAt: 10,
      stopPrice: 95
    });

    const fill = tryFillOrderOnBar(
      order,
      { timestamp: 11, open: 100, high: 101, low: 94, close: 96 },
      2,
      11,
      0
    );

    expect(fill).not.toBeNull();
    expect(fill?.position.entryPrice).toBe(95);
  });

  test('evaluates stop loss for buy position using bar low', () => {
    const stopState = evaluateStopsOnBar(
      {
        id: 'p1',
        side: 'buy',
        size: 1,
        entryPrice: 100,
        entryTime: 1,
        stopLoss: 98
      },
      { timestamp: 3, open: 101, high: 102, low: 97, close: 100 },
      2
    );

    expect(stopState.stopHit).toBeTrue();
    expect(stopState.exitPrice).toBe(98);
  });
});
