import type { Position, Trade } from '$shared/types';

interface ClosePositionOptions {
  pair: string;
  commissionPerLot?: number;
  exitPrice?: number;
  slippage?: number;
  setupTags?: string[];
  closeReason?: Trade['closeReason'];
  closeSize?: number;
}

function getPointValue(pair: string): number {
  return pair.includes('NAS') || pair.includes('US500') ? 1 : 10;
}

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
  pipValue: number = 10,
  commission: number = 0
): number {
  const priceDiff = position.side === 'buy'
    ? exitPrice - position.entryPrice
    : position.entryPrice - exitPrice;

  return priceDiff * position.size * pipValue - commission;
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

  if (pair.includes('NAS') || pair.includes('US500')) {
    return priceDiff;
  }

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
  options: ClosePositionOptions
): Trade {
  const closeSize = options.closeSize ?? position.size;
  const commission = (options.commissionPerLot || 0) * closeSize;
  const baseExit = options.exitPrice ?? (position.side === 'buy' ? currentBid : currentAsk);
  const slippage = options.slippage || 0;
  const slippedExit = position.side === 'buy' ? baseExit - slippage : baseExit + slippage;
  const pointValue = getPointValue(options.pair);
  const synthetic: Position = { ...position, size: closeSize };
  const realizedPnL = calculateRealizedPnL(synthetic, slippedExit, pointValue, commission);
  const pips = calculatePips(position.entryPrice, slippedExit, position.side, options.pair);
  const risk = position.riskAmount ? (position.riskAmount * closeSize) / position.size : 0;

  return {
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sessionId: position.sessionId,
    side: position.side,
    size: closeSize,
    entryPrice: position.entryPrice,
    exitPrice: slippedExit,
    entryTime: position.entryTime,
    exitTime: timestamp,
    realizedPnL,
    pips,
    commission,
    slippage,
    riskAmount: risk,
    rMultiple: risk > 0 ? realizedPnL / risk : undefined,
    setupTags: options.setupTags || [],
    closeReason: options.closeReason || 'manual'
  };
}

export function partiallyClosePosition(
  position: Position,
  currentBid: number,
  currentAsk: number,
  timestamp: number,
  closeRatio: number,
  options: ClosePositionOptions
): { trade: Trade; remainingPosition: Position | null } {
  const ratio = Math.min(1, Math.max(0.01, closeRatio));
  const closeSize = Number((position.size * ratio).toFixed(4));
  const trade = closePosition(position, currentBid, currentAsk, timestamp, {
    ...options,
    closeSize,
    closeReason: 'partial_close'
  });

  const remaining = Number((position.size - closeSize).toFixed(4));
  if (remaining <= 0) {
    return { trade, remainingPosition: null };
  }

  return {
    trade,
    remainingPosition: {
      ...position,
      size: remaining,
      riskAmount: position.riskAmount ? (position.riskAmount * remaining) / position.size : undefined
    }
  };
}

export function estimatePositionRisk(position: Position, pair: string): number {
  if (typeof position.stopLoss !== 'number') return 0;
  const distance = position.side === 'buy'
    ? position.entryPrice - position.stopLoss
    : position.stopLoss - position.entryPrice;
  if (distance <= 0) return 0;
  return distance * position.size * getPointValue(pair);
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
