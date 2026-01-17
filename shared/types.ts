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

export const PAIR_SPREADS: Record<ForexPair, number> = {
  EURUSD: 0.00015,  // 1.5 pips
  GBPUSD: 0.00015,  // 1.5 pips
  USDJPY: 0.015,    // 1.5 pips (JPY pairs different scale)
  USDCHF: 0.00025,  // 2.5 pips
};
