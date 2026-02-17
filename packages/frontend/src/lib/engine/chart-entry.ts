import type { RiskToolDraft, TradingPair } from '$shared/types';

export type ChartEntryOrderMode = 'market' | 'limit' | 'stop';
export type ChartEntrySizingMode = 'fixed' | 'risk_percent';

interface BuildChartEntryIntentInput {
  draft: RiskToolDraft;
  orderMode: ChartEntryOrderMode;
  market: {
    bid: number;
    ask: number;
    timestamp: number;
  };
  pair: TradingPair;
}

export interface ChartEntryIntent {
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss: number;
  createdAt: number;
  mode: ChartEntryOrderMode;
}

export function deriveRiskSide(entryPrice: number, stopPrice: number): 'buy' | 'sell' {
  return entryPrice > stopPrice ? 'buy' : 'sell';
}

export function buildChartEntryIntent(input: BuildChartEntryIntentInput): ChartEntryIntent {
  const side = input.draft.side;
  const marketEntry = side === 'buy' ? input.market.ask : input.market.bid;
  const requestedEntry = input.draft.entry.price;

  return {
    side,
    entryPrice: input.orderMode === 'market' ? marketEntry : requestedEntry,
    stopLoss: input.draft.stop.price,
    createdAt: input.market.timestamp,
    mode: input.orderMode
  };
}
