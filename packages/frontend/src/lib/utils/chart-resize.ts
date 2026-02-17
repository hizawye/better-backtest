export interface ChartSize {
  width: number;
  height: number;
}

export function normalizeChartSize(width: number, height: number): ChartSize {
  return {
    width: Math.max(0, Math.floor(width)),
    height: Math.max(0, Math.floor(height))
  };
}

export function shouldApplyChartResize(next: ChartSize, previous: ChartSize | null): boolean {
  if (next.width <= 0 || next.height <= 0) {
    return false;
  }

  if (!previous) {
    return true;
  }

  return next.width !== previous.width || next.height !== previous.height;
}
