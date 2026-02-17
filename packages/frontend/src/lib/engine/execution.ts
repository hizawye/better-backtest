import type { Bar, Order, Position } from '$shared/types';

interface MarketOrderOptions {
  sessionId?: string;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
  slippage?: number;
}

interface FillResult {
  position: Position;
  order: Order;
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function applyEntrySlippage(side: 'buy' | 'sell', price: number, slippage: number): number {
  return side === 'buy' ? price + slippage : price - slippage;
}

function makePosition(
  order: Pick<Order, 'side' | 'size' | 'stopLoss' | 'takeProfit' | 'riskAmount'> & { sessionId?: string },
  entryPrice: number,
  timestamp: number
): Position {
  return {
    id: randomId('pos'),
    sessionId: order.sessionId,
    side: order.side,
    size: order.size,
    entryPrice,
    entryTime: timestamp,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    riskAmount: order.riskAmount,
    currentPrice: entryPrice,
    unrealizedPnL: 0
  };
}

export function executeMarketOrder(
  side: 'buy' | 'sell',
  size: number,
  currentBid: number,
  currentAsk: number,
  timestamp: number,
  options: MarketOrderOptions = {}
): Position {
  const basePrice = side === 'buy' ? currentAsk : currentBid;
  const entryPrice = applyEntrySlippage(side, basePrice, options.slippage || 0);

  return makePosition(
    {
      sessionId: options.sessionId,
      side,
      size,
      stopLoss: options.stopLoss,
      takeProfit: options.takeProfit,
      riskAmount: options.riskAmount
    },
    entryPrice,
    timestamp
  );
}

export function createPendingOrder(input: {
  sessionId?: string;
  type: 'limit' | 'stop';
  side: 'buy' | 'sell';
  size: number;
  createdAt: number;
  price?: number;
  stopPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
}): Order {
  return {
    id: randomId('ord'),
    sessionId: input.sessionId,
    type: input.type,
    side: input.side,
    size: input.size,
    price: input.price,
    stopPrice: input.stopPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    riskAmount: input.riskAmount,
    status: 'pending',
    createdAt: input.createdAt
  };
}

function fillOrder(
  order: Order,
  fillPrice: number,
  timestamp: number,
  slippage: number
): FillResult {
  const entryPrice = applyEntrySlippage(order.side, fillPrice, slippage);
  const position = makePosition(order, entryPrice, timestamp);
  const filledOrder: Order = {
    ...order,
    status: 'filled',
    filledAt: timestamp,
    filledPrice: entryPrice,
    triggeredAt: timestamp
  };

  return { position, order: filledOrder };
}

export function tryFillOrder(
  order: Order,
  currentBid: number,
  currentAsk: number,
  timestamp: number,
  slippage: number
): FillResult | null {
  if (order.status !== 'pending') return null;

  if (order.type === 'limit') {
    if (order.side === 'buy' && typeof order.price === 'number' && currentAsk <= order.price) {
      return fillOrder(order, order.price, timestamp, slippage);
    }

    if (order.side === 'sell' && typeof order.price === 'number' && currentBid >= order.price) {
      return fillOrder(order, order.price, timestamp, slippage);
    }
  }

  if (order.type === 'stop') {
    if (order.side === 'buy' && typeof order.stopPrice === 'number' && currentAsk >= order.stopPrice) {
      return fillOrder(order, currentAsk, timestamp, slippage);
    }

    if (order.side === 'sell' && typeof order.stopPrice === 'number' && currentBid <= order.stopPrice) {
      return fillOrder(order, currentBid, timestamp, slippage);
    }
  }

  return null;
}

export function tryFillOrderOnBar(
  order: Order,
  bar: Bar,
  spread: number,
  timestamp: number,
  slippage: number
): FillResult | null {
  if (order.status !== 'pending') return null;

  const halfSpread = spread / 2;
  const bidHigh = bar.high - halfSpread;
  const bidLow = bar.low - halfSpread;
  const askHigh = bar.high + halfSpread;
  const askLow = bar.low + halfSpread;

  if (order.type === 'limit') {
    if (order.side === 'buy' && typeof order.price === 'number' && askLow <= order.price) {
      return fillOrder(order, order.price, timestamp, slippage);
    }

    if (order.side === 'sell' && typeof order.price === 'number' && bidHigh >= order.price) {
      return fillOrder(order, order.price, timestamp, slippage);
    }
  }

  if (order.type === 'stop') {
    if (order.side === 'buy' && typeof order.stopPrice === 'number' && askHigh >= order.stopPrice) {
      return fillOrder(order, order.stopPrice, timestamp, slippage);
    }

    if (order.side === 'sell' && typeof order.stopPrice === 'number' && bidLow <= order.stopPrice) {
      return fillOrder(order, order.stopPrice, timestamp, slippage);
    }
  }

  return null;
}

export function evaluateStops(position: Position, bid: number, ask: number): {
  stopHit: boolean;
  takeProfitHit: boolean;
  exitPrice?: number;
} {
  if (position.side === 'buy') {
    const stopHit = typeof position.stopLoss === 'number' && bid <= position.stopLoss;
    const takeProfitHit = typeof position.takeProfit === 'number' && bid >= position.takeProfit;
    if (stopHit) return { stopHit: true, takeProfitHit: false, exitPrice: position.stopLoss };
    if (takeProfitHit) return { stopHit: false, takeProfitHit: true, exitPrice: position.takeProfit };
    return { stopHit: false, takeProfitHit: false };
  }

  const stopHit = typeof position.stopLoss === 'number' && ask >= position.stopLoss;
  const takeProfitHit = typeof position.takeProfit === 'number' && ask <= position.takeProfit;
  if (stopHit) return { stopHit: true, takeProfitHit: false, exitPrice: position.stopLoss };
  if (takeProfitHit) return { stopHit: false, takeProfitHit: true, exitPrice: position.takeProfit };
  return { stopHit: false, takeProfitHit: false };
}

export function evaluateStopsOnBar(
  position: Position,
  bar: Bar,
  spread: number
): {
  stopHit: boolean;
  takeProfitHit: boolean;
  exitPrice?: number;
} {
  const halfSpread = spread / 2;
  const bidHigh = bar.high - halfSpread;
  const bidLow = bar.low - halfSpread;
  const askHigh = bar.high + halfSpread;
  const askLow = bar.low + halfSpread;

  if (position.side === 'buy') {
    const stopHit = typeof position.stopLoss === 'number' && bidLow <= position.stopLoss;
    const takeProfitHit = typeof position.takeProfit === 'number' && bidHigh >= position.takeProfit;
    if (stopHit) return { stopHit: true, takeProfitHit: false, exitPrice: position.stopLoss };
    if (takeProfitHit) return { stopHit: false, takeProfitHit: true, exitPrice: position.takeProfit };
    return { stopHit: false, takeProfitHit: false };
  }

  const stopHit = typeof position.stopLoss === 'number' && askHigh >= position.stopLoss;
  const takeProfitHit = typeof position.takeProfit === 'number' && askLow <= position.takeProfit;
  if (stopHit) return { stopHit: true, takeProfitHit: false, exitPrice: position.stopLoss };
  if (takeProfitHit) return { stopHit: false, takeProfitHit: true, exitPrice: position.takeProfit };
  return { stopHit: false, takeProfitHit: false };
}
