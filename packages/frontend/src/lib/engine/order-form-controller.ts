import { PAIR_CATEGORIES, type Tick, type TradingPair } from '$shared/types';
import { calculateRiskBasedSize, validateStopTargets } from './risk';

export type OrderFormOrderType = 'market' | 'limit' | 'stop';
export type OrderFormSizingMode = 'fixed' | 'risk_percent';

function pointValue(pair: TradingPair): number {
  return PAIR_CATEGORIES[pair] === 'index' ? 1 : 10;
}

export function isIndexPair(pair: TradingPair): boolean {
  return PAIR_CATEGORIES[pair] === 'index';
}

export function toTickDistance(pair: TradingPair, distance: number): number {
  const scale = isIndexPair(pair) ? 1 : 10_000;
  return Math.abs(distance) * scale;
}

export function resolveEntryPrice(input: {
  side: 'buy' | 'sell';
  orderType: OrderFormOrderType;
  currentTick: Tick | null;
  limitPrice: number;
  stopPrice: number;
}): number {
  const { side, orderType, currentTick, limitPrice, stopPrice } = input;
  if (!currentTick) return 0;
  if (orderType === 'limit') return limitPrice;
  if (orderType === 'stop') return stopPrice;
  return side === 'buy' ? currentTick.ask : currentTick.bid;
}

export function calculateRiskAmountForDraft(input: {
  pair: TradingPair;
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss: number;
  size: number;
}): number | undefined {
  const { pair, side, entryPrice, stopLoss, size } = input;
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) return undefined;
  const riskDistance = side === 'buy' ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (!Number.isFinite(riskDistance) || riskDistance <= 0) return undefined;
  return Number((riskDistance * size * pointValue(pair)).toFixed(2));
}

export function resolveSizeAndRisk(input: {
  pair: TradingPair;
  side: 'buy' | 'sell';
  sizingMode: OrderFormSizingMode;
  fixedSize: number;
  equity: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
}): { size: number; riskAmount?: number; error?: string } {
  const {
    pair,
    side,
    sizingMode,
    fixedSize,
    equity,
    riskPercent,
    entryPrice,
    stopLoss
  } = input;

  if (sizingMode === 'fixed') {
    return {
      size: fixedSize,
      riskAmount: calculateRiskAmountForDraft({ pair, side, entryPrice, stopLoss, size: fixedSize })
    };
  }

  if (!stopLoss || stopLoss <= 0) {
    return { size: 0, error: 'Risk-% mode requires stop loss.' };
  }

  const resolved = calculateRiskBasedSize(equity, riskPercent, entryPrice, stopLoss, pair);
  return {
    size: resolved.size,
    riskAmount: resolved.riskAmount
  };
}

export function validateOrderInput(input: {
  side: 'buy' | 'sell';
  pair: TradingPair;
  orderType: OrderFormOrderType;
  size: number;
  currentTick: Tick | null;
  limitPrice: number;
  stopPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  entryPrice: number;
  openRisk: number;
  equity: number;
  riskAmount?: number;
  sizingMode: OrderFormSizingMode;
  riskPercent: number;
  maxPositionSize: number;
}): string | null {
  const {
    side,
    orderType,
    size,
    currentTick,
    limitPrice,
    stopPrice,
    stopLoss,
    takeProfit,
    entryPrice,
    openRisk,
    equity,
    riskAmount,
    sizingMode,
    riskPercent,
    maxPositionSize
  } = input;

  if (!currentTick) return 'No market tick available.';
  if (!Number.isFinite(size) || size <= 0) return 'Order size must be greater than zero.';
  if (size > maxPositionSize) return `Max position size is ${maxPositionSize} lots.`;

  if (orderType === 'limit' && limitPrice <= 0) return 'Limit price is required for limit order.';
  if (orderType === 'stop' && stopPrice <= 0) return 'Stop trigger price is required for stop order.';
  if (orderType === 'limit' && side === 'buy' && limitPrice >= currentTick.ask) {
    return 'Buy limit must be below current ask.';
  }
  if (orderType === 'limit' && side === 'sell' && limitPrice <= currentTick.bid) {
    return 'Sell limit must be above current bid.';
  }
  if (orderType === 'stop' && side === 'buy' && stopPrice <= currentTick.ask) {
    return 'Buy stop must be above current ask.';
  }
  if (orderType === 'stop' && side === 'sell' && stopPrice >= currentTick.bid) {
    return 'Sell stop must be below current bid.';
  }

  const stopErr = validateStopTargets({
    side,
    entryPrice,
    stopLoss: typeof stopLoss === 'number' && stopLoss > 0 ? stopLoss : undefined,
    takeProfit: typeof takeProfit === 'number' && takeProfit > 0 ? takeProfit : undefined
  });
  if (stopErr) return stopErr;

  if (sizingMode === 'risk_percent') {
    const selectedRisk = (equity * riskPercent) / 100;
    if (selectedRisk > equity) return 'Insufficient equity for selected risk.';
  }

  if (typeof riskAmount === 'number' && openRisk + riskAmount > equity) {
    return 'Open risk plus trade risk exceeds available equity.';
  }

  return null;
}
