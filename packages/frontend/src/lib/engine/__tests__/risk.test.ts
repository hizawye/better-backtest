import { describe, expect, test } from 'bun:test';
import { calculateRiskBasedSize, validateStopTargets } from '../risk';

describe('risk engine', () => {
  test('calculates position size from risk percent', () => {
    const result = calculateRiskBasedSize(10000, 1, 20000, 19950, 'NAS100');
    expect(result.riskAmount).toBe(100);
    expect(result.size).toBe(2);
  });

  test('rejects invalid buy stop loss above entry', () => {
    const err = validateStopTargets({
      side: 'buy',
      entryPrice: 100,
      stopLoss: 101
    });
    expect(err).toBe('Buy stop loss must be below entry.');
  });
});
