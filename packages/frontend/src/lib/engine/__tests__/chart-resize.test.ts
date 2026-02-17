import { describe, expect, test } from 'bun:test';
import { normalizeChartSize, shouldApplyChartResize } from '../../utils/chart-resize';

describe('chart resize guards', () => {
  test('normalizes sub-pixel dimensions to stable integer values', () => {
    const size = normalizeChartSize(1023.98, 511.33);
    expect(size).toEqual({ width: 1023, height: 511 });
  });

  test('blocks non-positive dimensions', () => {
    expect(shouldApplyChartResize({ width: 0, height: 400 }, null)).toBeFalse();
    expect(shouldApplyChartResize({ width: 900, height: 0 }, null)).toBeFalse();
  });

  test('applies first valid dimensions and deduplicates repeats', () => {
    const first = { width: 1200, height: 680 };
    expect(shouldApplyChartResize(first, null)).toBeTrue();
    expect(shouldApplyChartResize(first, first)).toBeFalse();
  });

  test('applies when either width or height changes', () => {
    const previous = { width: 1200, height: 680 };
    expect(shouldApplyChartResize({ width: 1201, height: 680 }, previous)).toBeTrue();
    expect(shouldApplyChartResize({ width: 1200, height: 681 }, previous)).toBeTrue();
  });
});
