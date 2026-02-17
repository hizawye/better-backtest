import type { Bar } from '$shared/types';

export interface DataGap {
  from: number;
  to: number;
  missingBars: number;
}

export function detectMinuteGaps(bars: Bar[]): DataGap[] {
  if (bars.length < 2) return [];
  const ordered = [...bars].sort((a, b) => a.timestamp - b.timestamp);
  const expected = 60_000;
  const gaps: DataGap[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const diff = ordered[i].timestamp - ordered[i - 1].timestamp;
    if (diff <= expected) continue;

    const missingBars = Math.floor(diff / expected) - 1;
    if (missingBars > 0) {
      gaps.push({
        from: ordered[i - 1].timestamp,
        to: ordered[i].timestamp,
        missingBars
      });
    }
  }

  return gaps;
}
