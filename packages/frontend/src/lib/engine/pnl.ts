import type { Position, Trade } from '$shared/types';

export function calculateUnrealizedPnL(
  position: Position,
  currentBid: number,
  currentAsk: number,
  pipValue: number = 10 // USD per pip for standard lot
): number {
  const currentPrice = position.side === 'buy' ? currentBid : currentAsk;
  const priceDiff = position.side === 'buy'
    ? currentPrice - position.entryPrice
    : position.entryPrice - currentPrice;

  return priceDiff * position.size * pipValue;
}

export function calculateRealizedPnL(
  position: Position,
  exitPrice: number,
  pipValue: number = 10
): number {
  const priceDiff = position.side === 'buy'
    ? exitPrice - position.entryPrice
    : position.entryPrice - exitPrice;

  return priceDiff * position.size * pipValue;
}

export function calculatePips(
  entryPrice: number,
  exitPrice: number,
  side: 'buy' | 'sell',
  pair: string
): number {
  const priceDiff = side === 'buy'
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;

  // For JPY pairs, 1 pip = 0.01
  // For other pairs, 1 pip = 0.0001
  const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;

  return priceDiff / pipSize;
}

export function closePosition(
  position: Position,
  currentBid: number,
  currentAsk: number,
  timestamp: number,
  pair: string
): Trade {
  const exitPrice = position.side === 'buy' ? currentBid : currentAsk;
  const realizedPnL = calculateRealizedPnL(position, exitPrice);
  const pips = calculatePips(position.entryPrice, exitPrice, position.side, pair);

  return {
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    side: position.side,
    size: position.size,
    entryPrice: position.entryPrice,
    exitPrice,
    entryTime: position.entryTime,
    exitTime: timestamp,
    realizedPnL,
    pips
  };
}

export function updatePositionPnL(
  position: Position,
  currentBid: number,
  currentAsk: number
): Position {
  const currentPrice = position.side === 'buy' ? currentBid : currentAsk;
  const unrealizedPnL = calculateUnrealizedPnL(position, currentBid, currentAsk);

  return {
    ...position,
    currentPrice,
    unrealizedPnL
  };
}
