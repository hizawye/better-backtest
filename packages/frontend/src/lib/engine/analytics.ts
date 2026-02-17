import type { AnalyticsSnapshot, Trade } from '$shared/types';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function streaks(trades: Trade[]): { best: number; worst: number } {
  let best = 0;
  let worst = 0;
  let win = 0;
  let loss = 0;

  for (const trade of trades) {
    if (trade.realizedPnL > 0) {
      win += 1;
      loss = 0;
      best = Math.max(best, win);
    } else if (trade.realizedPnL < 0) {
      loss += 1;
      win = 0;
      worst = Math.max(worst, loss);
    }
  }

  return { best, worst };
}

function bucketR(value: number): string {
  if (value < -2) return '< -2R';
  if (value < -1) return '-2R..-1R';
  if (value < 0) return '-1R..0R';
  if (value < 1) return '0R..1R';
  if (value < 2) return '1R..2R';
  return '>= 2R';
}

export function computeAnalyticsSnapshot(
  sessionId: string,
  trades: Trade[],
  startingBalance: number
): AnalyticsSnapshot {
  const ordered = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const wins = ordered.filter((trade) => trade.realizedPnL > 0);
  const losses = ordered.filter((trade) => trade.realizedPnL < 0);
  const totalPnL = ordered.reduce((sum, trade) => sum + trade.realizedPnL, 0);
  const totalTrades = ordered.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const averageWin = wins.length > 0 ? wins.reduce((sum, trade) => sum + trade.realizedPnL, 0) / wins.length : 0;
  const averageLoss = losses.length > 0 ? losses.reduce((sum, trade) => sum + trade.realizedPnL, 0) / losses.length : 0;
  const expectancy = totalTrades > 0 ? totalPnL / totalTrades : 0;
  const grossWin = wins.reduce((sum, trade) => sum + trade.realizedPnL, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.realizedPnL, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Number.POSITIVE_INFINITY : 0;

  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  const equityCurve: Array<{ timestamp: number; value: number }> = [];
  const drawdownCurve: Array<{ timestamp: number; value: number }> = [];

  for (const trade of ordered) {
    equity += trade.realizedPnL;
    peak = Math.max(peak, equity);
    const drawdown = peak - equity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    equityCurve.push({ timestamp: trade.exitTime, value: Number(equity.toFixed(2)) });
    drawdownCurve.push({ timestamp: trade.exitTime, value: Number(drawdown.toFixed(2)) });
  }

  const bySetupTag: AnalyticsSnapshot['bySetupTag'] = {};
  const byHour: AnalyticsSnapshot['byHour'] = {};
  const byDayOfWeek: AnalyticsSnapshot['byDayOfWeek'] = {};
  const rBuckets = new Map<string, number>();
  const rValues: number[] = [];

  for (const trade of ordered) {
    const tags = trade.setupTags && trade.setupTags.length > 0 ? trade.setupTags : ['untagged'];
    for (const tag of tags) {
      const prev = bySetupTag[tag] || { trades: 0, pnl: 0, winRate: 0 };
      prev.trades += 1;
      prev.pnl += trade.realizedPnL;
      if (trade.realizedPnL > 0) {
        prev.winRate += 1;
      }
      bySetupTag[tag] = prev;
    }

    const hour = new Date(trade.exitTime).getUTCHours().toString().padStart(2, '0');
    const hourStat = byHour[hour] || { trades: 0, pnl: 0, winRate: 0 };
    hourStat.trades += 1;
    hourStat.pnl += trade.realizedPnL;
    if (trade.realizedPnL > 0) {
      hourStat.winRate += 1;
    }
    byHour[hour] = hourStat;

    const day = new Date(trade.exitTime).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const dayStat = byDayOfWeek[day] || { trades: 0, pnl: 0, winRate: 0 };
    dayStat.trades += 1;
    dayStat.pnl += trade.realizedPnL;
    if (trade.realizedPnL > 0) {
      dayStat.winRate += 1;
    }
    byDayOfWeek[day] = dayStat;

    if (typeof trade.rMultiple === 'number' && Number.isFinite(trade.rMultiple)) {
      const bucket = bucketR(trade.rMultiple);
      rBuckets.set(bucket, (rBuckets.get(bucket) || 0) + 1);
      rValues.push(trade.rMultiple);
    }
  }

  for (const stats of Object.values(bySetupTag)) {
    stats.winRate = stats.trades > 0 ? (stats.winRate / stats.trades) * 100 : 0;
    stats.pnl = Number(stats.pnl.toFixed(2));
    stats.winRate = Number(stats.winRate.toFixed(1));
  }
  for (const stats of Object.values(byHour)) {
    stats.winRate = stats.trades > 0 ? (stats.winRate / stats.trades) * 100 : 0;
    stats.pnl = Number(stats.pnl.toFixed(2));
    stats.winRate = Number(stats.winRate.toFixed(1));
  }
  for (const stats of Object.values(byDayOfWeek)) {
    stats.winRate = stats.trades > 0 ? (stats.winRate / stats.trades) * 100 : 0;
    stats.pnl = Number(stats.pnl.toFixed(2));
    stats.winRate = Number(stats.winRate.toFixed(1));
  }

  const rDistribution = Array.from(rBuckets.entries()).map(([bucket, count]) => ({ bucket, count }));
  const avgR = rValues.length > 0 ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : 0;
  const { best, worst } = streaks(ordered);

  return {
    id: `analytics_${sessionId}_${Date.now()}`,
    sessionId,
    createdAt: Date.now(),
    totalTrades,
    winRate: Number(winRate.toFixed(1)),
    totalPnL: Number(totalPnL.toFixed(2)),
    expectancy: Number(expectancy.toFixed(2)),
    profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    averageWin: Number(averageWin.toFixed(2)),
    averageLoss: Number(averageLoss.toFixed(2)),
    bestStreak: best,
    worstStreak: worst,
    averageRMultiple: Number(avgR.toFixed(2)),
    medianRMultiple: Number(median(rValues).toFixed(2)),
    bySetupTag,
    byHour,
    byDayOfWeek,
    equityCurve,
    drawdownCurve,
    rDistribution
  };
}
