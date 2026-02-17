import { describe, expect, test } from 'bun:test';
import { closePosition } from '../pnl';
import { createPendingOrder, evaluateStopsOnBar, tryFillOrderOnBar } from '../execution';

describe('order lifecycle integration', () => {
  test('pending order -> fill -> take profit close', () => {
    const order = createPendingOrder({
      sessionId: 'integration',
      type: 'limit',
      side: 'buy',
      size: 1,
      createdAt: 1,
      price: 100,
      stopLoss: 95,
      takeProfit: 110,
      riskAmount: 5
    });

    const filled = tryFillOrderOnBar(
      order,
      { timestamp: 2, open: 102, high: 103, low: 99, close: 101 },
      2,
      2,
      0
    );
    expect(filled).not.toBeNull();

    const stopState = evaluateStopsOnBar(
      { ...filled!.position, stopLoss: 95, takeProfit: 110 },
      { timestamp: 3, open: 108, high: 111, low: 107, close: 110 },
      2
    );
    expect(stopState.takeProfitHit).toBeTrue();

    const trade = closePosition(
      filled!.position,
      110,
      111,
      3,
      {
        pair: 'NAS100',
        exitPrice: stopState.exitPrice,
        closeReason: 'take_profit'
      }
    );

    expect(trade.closeReason).toBe('take_profit');
    expect(trade.realizedPnL).toBeGreaterThan(0);
  });
});
