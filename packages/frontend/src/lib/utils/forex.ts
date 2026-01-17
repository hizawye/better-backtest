export function calculatePipValue(pair: string, lotSize: number = 100000): number {
  // Standard lot = 100,000 units
  // Mini lot = 10,000 units
  // Micro lot = 1,000 units

  // For most pairs: 1 pip = 0.0001
  // For JPY pairs: 1 pip = 0.01

  const isJpyPair = pair.includes('JPY');
  const pipSize = isJpyPair ? 0.01 : 0.0001;

  // Value per pip = (pip size * lot size)
  return pipSize * lotSize;
}

export function formatPrice(price: number, pair: string): string {
  const isJpyPair = pair.includes('JPY');
  const decimals = isJpyPair ? 3 : 5;
  return price.toFixed(decimals);
}

export function formatPips(pips: number): string {
  return pips >= 0 ? `+${pips.toFixed(1)}` : pips.toFixed(1);
}

export function formatPnL(pnl: number): string {
  const formatted = Math.abs(pnl).toFixed(2);
  return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
}

export function calculateLotSize(units: number): number {
  return units / 100000; // Convert units to lots
}

export function calculateUnits(lots: number): number {
  return lots * 100000; // Convert lots to units
}
