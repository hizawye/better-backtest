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
  type: 'market' | 'limit' | 'stop';
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  stopPrice?: number;
  status: 'pending' | 'filled' | 'cancelled';
  createdAt: number;
  filledAt?: number;
  filledPrice?: number;
}

export interface Position {
  id: string;
  side: 'buy' | 'sell';
  size: number;
  entryPrice: number;
  entryTime: number;
  currentPrice?: number;
  unrealizedPnL?: number;
}

export interface Trade {
  id: string;
  side: 'buy' | 'sell';
  size: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  realizedPnL: number;
  pips: number;
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
