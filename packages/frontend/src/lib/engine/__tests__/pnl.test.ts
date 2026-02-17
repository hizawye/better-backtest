import { describe, expect, test } from 'bun:test';
import { closePosition, partiallyClosePosition } from '../pnl';

describe('pnl engine', () => {
  test('applies commission and slippage on close', () => {
    const trade = closePosition(
      {
        id: 'p1',
        side: 'buy',
        size: 1,
        entryPrice: 100,
        entryTime: 1
      },
      105,
      106,
      2,
      {
        pair: 'NAS100',
        commissionPerLot: 2,
        slippage: 0.5
      }
    );

    expect(trade.exitPrice).toBe(104.5);
    expect(trade.commission).toBe(2);
    expect(trade.realizedPnL).toBe(2.5);
  });

  test('partial close returns trade and remaining position', () => {
    const result = partiallyClosePosition(
      {
        id: 'p2',
        side: 'sell',
        size: 2,
        entryPrice: 200,
        entryTime: 1,
        riskAmount: 400
      },
      180,
      181,
      10,
      0.5,
      { pair: 'NAS100' }
    );

    expect(result.trade.size).toBe(1);
    expect(result.remainingPosition?.size).toBe(1);
    expect(result.remainingPosition?.riskAmount).toBe(200);
  });
});
