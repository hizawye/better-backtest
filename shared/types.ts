export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Tick {
  timestamp: number;
  bid: number;
  ask: number;
}

export interface Order {
  id: string;
  sessionId?: string;
  type: 'market' | 'limit' | 'stop';
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  stopPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
  commission?: number;
  slippage?: number;
  cancelReason?: string;
  triggeredAt?: number;
  status: 'pending' | 'filled' | 'cancelled';
  createdAt: number;
  filledAt?: number;
  filledPrice?: number;
}

export interface Position {
  id: string;
  sessionId?: string;
  side: 'buy' | 'sell';
  size: number;
  entryPrice: number;
  entryTime: number;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
  rMultipleLive?: number;
  currentPrice?: number;
  unrealizedPnL?: number;
}

export interface Trade {
  id: string;
  sessionId?: string;
  side: 'buy' | 'sell';
  size: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  realizedPnL: number;
  pips: number;
  commission?: number;
  slippage?: number;
  riskAmount?: number;
  rMultiple?: number;
  setupTags?: string[];
}

export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';

export interface ExecutionConfig {
  spread: number;
  slippage: number;
  commissionPerLot: number;
}

export interface BacktestConfig {
  pair: TradingPair;
  timeframe: Timeframe;
  from: number;
  to: number;
  startingBalance: number;
  execution: ExecutionConfig;
}

export interface BacktestSession {
  id: string;
  name: string;
  config: BacktestConfig;
  createdAt: number;
  updatedAt: number;
  lastReplayIndex: number;
}

export interface SessionSnapshot {
  sessionId: string;
  savedAt: number;
  currentIndex: number;
  balance: number;
  equity: number;
  positions: Position[];
  orders: Order[];
  trades: Trade[];
}

export interface JournalEntry {
  id: string;
  sessionId: string;
  tradeId?: string;
  timestamp: number;
  setupTags: string[];
  confidence?: number;
  checklist?: string[];
  notes: string;
  reviewStatus: 'todo' | 'reviewed';
  screenshotRefs?: string[];
}

export interface TradeReview {
  tradeId: string;
  sessionId: string;
  rating?: number;
  notes?: string;
  reviewedAt: number;
}

export interface AnalyticsSnapshot {
  id: string;
  sessionId: string;
  createdAt: number;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
}

export interface TickData {
  id: string;
  pair: string;
  hour: number;
  bars: Float32Array;
}

export type ForexPair = 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'USDCHF';
export type IndexPair = 'NAS100' | 'US500';
export type TradingPair = ForexPair | IndexPair;

export const PAIR_SPREADS: Record<TradingPair, number> = {
  // Forex pairs (in pips)
  EURUSD: 0.00015,  // 1.5 pips
  GBPUSD: 0.00015,  // 1.5 pips
  USDJPY: 0.015,    // 1.5 pips (JPY pairs different scale)
  USDCHF: 0.00025,  // 2.5 pips
  // Index pairs (in points)
  NAS100: 2.0,      // 2 points spread for NASDAQ 100
  US500: 0.5,       // 0.5 points spread for S&P 500
};

export const PAIR_LABELS: Record<TradingPair, string> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  USDCHF: 'USD/CHF',
  NAS100: 'NASDAQ 100',
  US500: 'S&P 500',
};

export const PAIR_CATEGORIES: Record<TradingPair, 'forex' | 'index'> = {
  EURUSD: 'forex',
  GBPUSD: 'forex',
  USDJPY: 'forex',
  USDCHF: 'forex',
  NAS100: 'index',
  US500: 'index',
};

export const TIMEFRAME_TO_MS: Record<Timeframe, number> = {
  M1: 60_000,
  M5: 300_000,
  M15: 900_000,
  H1: 3_600_000,
  H4: 14_400_000,
  D1: 86_400_000
};
