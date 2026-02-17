import type { Position } from '$shared/types';
import { estimatePositionRisk } from './pnl';

function getPointValue(pair: string): number {
  return pair.includes('NAS') || pair.includes('US500') ? 1 : 10;
}

export function calculateRiskBasedSize(
  equity: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number,
  pair: string
): { size: number; riskAmount: number } {
  const riskAmount = (equity * riskPercent) / 100;
  const distance = Math.abs(entryPrice - stopLoss);
  const denom = distance * getPointValue(pair);

  if (riskAmount <= 0 || distance <= 0 || denom <= 0) {
    return { size: 0, riskAmount: 0 };
  }

  const size = riskAmount / denom;
  return {
    size: Number(size.toFixed(4)),
    riskAmount: Number(riskAmount.toFixed(2))
  };
}

export function validateStopTargets(input: {
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}): string | null {
  const { side, entryPrice, stopLoss, takeProfit } = input;

  if (typeof stopLoss === 'number') {
    if (side === 'buy' && stopLoss >= entryPrice) {
      return 'Buy stop loss must be below entry.';
    }
    if (side === 'sell' && stopLoss <= entryPrice) {
      return 'Sell stop loss must be above entry.';
    }
  }

  if (typeof takeProfit === 'number') {
    if (side === 'buy' && takeProfit <= entryPrice) {
      return 'Buy take profit must be above entry.';
    }
    if (side === 'sell' && takeProfit >= entryPrice) {
      return 'Sell take profit must be below entry.';
    }
  }

  return null;
}

export function getOpenRisk(positions: Position[], pair: string): number {
  return positions.reduce((sum, position) => sum + estimatePositionRisk(position, pair), 0);
}

export function getExposure(positions: Position[]): number {
  return positions.reduce((sum, position) => sum + position.size, 0);
}
