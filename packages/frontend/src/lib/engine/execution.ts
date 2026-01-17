import type { Order, Position, Trade } from '../../../../shared/types';

export function executeMarketOrder(
  side: 'buy' | 'sell',
  size: number,
  currentBid: number,
  currentAsk: number,
  timestamp: number
): Position {
  const price = side === 'buy' ? currentAsk : currentBid;

  return {
    id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    side,
    size,
    entryPrice: price,
    entryTime: timestamp,
    currentPrice: price,
    unrealizedPnL: 0
  };
}

export function executeLimitOrder(
  order: Order,
  currentBid: number,
  currentAsk: number,
  timestamp: number
): Position | null {
  if (!order.price) return null;

  // Buy limit: execute when ask <= limit price
  if (order.side === 'buy' && currentAsk <= order.price) {
    return {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side: order.side,
      size: order.size,
      entryPrice: order.price,
      entryTime: timestamp,
      currentPrice: currentAsk,
      unrealizedPnL: 0
    };
  }

  // Sell limit: execute when bid >= limit price
  if (order.side === 'sell' && currentBid >= order.price) {
    return {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side: order.side,
      size: order.size,
      entryPrice: order.price,
      entryTime: timestamp,
      currentPrice: currentBid,
      unrealizedPnL: 0
    };
  }

  return null;
}

export function executeStopOrder(
  order: Order,
  currentBid: number,
  currentAsk: number,
  timestamp: number
): Position | null {
  if (!order.stopPrice) return null;

  // Buy stop: execute when ask >= stop price
  if (order.side === 'buy' && currentAsk >= order.stopPrice) {
    return {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side: order.side,
      size: order.size,
      entryPrice: currentAsk,
      entryTime: timestamp,
      currentPrice: currentAsk,
      unrealizedPnL: 0
    };
  }

  // Sell stop: execute when bid <= stop price
  if (order.side === 'sell' && currentBid <= order.stopPrice) {
    return {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      side: order.side,
      size: order.size,
      entryPrice: currentBid,
      entryTime: timestamp,
      currentPrice: currentBid,
      unrealizedPnL: 0
    };
  }

  return null;
}
