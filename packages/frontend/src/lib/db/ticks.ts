import Dexie, { type EntityTable } from 'dexie';
import type { Bar } from '../../../../shared/types';

interface BarRecord {
  id: string;
  pair: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const db = new Dexie('BetterBacktest') as Dexie & {
  bars: EntityTable<BarRecord, 'id'>;
};

db.version(1).stores({
  bars: 'id, pair, timestamp'
});

export async function saveBars(pair: string, bars: Bar[]): Promise<void> {
  const records: BarRecord[] = bars.map(bar => ({
    id: `${pair}_${bar.timestamp}`,
    pair,
    ...bar
  }));

  await db.bars.bulkPut(records);
}

export async function getBars(
  pair: string,
  from: number,
  to: number
): Promise<Bar[]> {
  const records = await db.bars
    .where('pair')
    .equals(pair)
    .and(bar => bar.timestamp >= from && bar.timestamp <= to)
    .toArray();

  return records.map(({ id, pair, ...bar }) => bar);
}

export async function clearBars(pair?: string): Promise<void> {
  if (pair) {
    await db.bars.where('pair').equals(pair).delete();
  } else {
    await db.bars.clear();
  }
}

export { db };
