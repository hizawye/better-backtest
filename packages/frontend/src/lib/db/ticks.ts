import Dexie, { type EntityTable } from 'dexie';
import type {
  AnalyticsSnapshot,
  BacktestSession,
  Bar,
  JournalEntry,
  Order,
  Position,
  SessionSnapshot,
  Trade
} from '$shared/types';

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

interface SessionRecord extends BacktestSession {
  pair: string;
  timeframe: string;
  from: number;
  to: number;
  startingBalance: number;
  spread: number;
  slippage: number;
  commissionPerLot: number;
}

const db = new Dexie('BetterBacktest') as Dexie & {
  bars: EntityTable<BarRecord, 'id'>;
  sessions: EntityTable<SessionRecord, 'id'>;
  snapshots: EntityTable<SessionSnapshot, 'sessionId'>;
  orders: EntityTable<Order, 'id'>;
  positions: EntityTable<Position, 'id'>;
  trades: EntityTable<Trade, 'id'>;
  journalEntries: EntityTable<JournalEntry, 'id'>;
  analyticsSnapshots: EntityTable<AnalyticsSnapshot, 'id'>;
};

db.version(1).stores({
  bars: 'id, pair, timestamp'
});

db.version(2).stores({
  bars: 'id, pair, timestamp',
  sessions: 'id, updatedAt, pair, timeframe, from, to',
  snapshots: 'sessionId, savedAt',
  orders: 'id, sessionId, status, createdAt',
  positions: 'id, sessionId, entryTime',
  trades: 'id, sessionId, exitTime',
  journalEntries: 'id, sessionId, timestamp, reviewStatus',
  analyticsSnapshots: 'id, sessionId, createdAt'
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

function toRecord(session: BacktestSession): SessionRecord {
  return {
    ...session,
    pair: session.config.pair,
    timeframe: session.config.timeframe,
    from: session.config.from,
    to: session.config.to,
    startingBalance: session.config.startingBalance,
    spread: session.config.execution.spread,
    slippage: session.config.execution.slippage,
    commissionPerLot: session.config.execution.commissionPerLot
  };
}

function toSession(record: SessionRecord): BacktestSession {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastReplayIndex: record.lastReplayIndex,
    config: {
      pair: record.pair as BacktestSession['config']['pair'],
      timeframe: record.timeframe as BacktestSession['config']['timeframe'],
      from: record.from,
      to: record.to,
      startingBalance: record.startingBalance,
      execution: {
        spread: record.spread,
        slippage: record.slippage,
        commissionPerLot: record.commissionPerLot
      }
    }
  };
}

export async function saveSession(session: BacktestSession): Promise<void> {
  await db.sessions.put(toRecord(session));
}

export async function getSession(sessionId: string): Promise<BacktestSession | undefined> {
  const record = await db.sessions.get(sessionId);
  return record ? toSession(record) : undefined;
}

export async function listSessions(): Promise<BacktestSession[]> {
  const records = await db.sessions.orderBy('updatedAt').reverse().toArray();
  return records.map(toSession);
}

export async function saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
  await db.snapshots.put(snapshot);
}

export async function getSnapshot(sessionId: string): Promise<SessionSnapshot | undefined> {
  return db.snapshots.get(sessionId);
}

export async function saveSessionEntities(
  sessionId: string,
  payload: {
    orders?: Order[];
    positions?: Position[];
    trades?: Trade[];
  }
): Promise<void> {
  await db.transaction('rw', [db.orders, db.positions, db.trades], async () => {
    if (payload.orders) {
      await db.orders.where('sessionId').equals(sessionId).delete();
      await db.orders.bulkPut(payload.orders.map((order) => ({ ...order, sessionId })));
    }

    if (payload.positions) {
      await db.positions.where('sessionId').equals(sessionId).delete();
      await db.positions.bulkPut(payload.positions.map((position) => ({ ...position, sessionId })));
    }

    if (payload.trades) {
      await db.trades.where('sessionId').equals(sessionId).delete();
      await db.trades.bulkPut(payload.trades.map((trade) => ({ ...trade, sessionId })));
    }
  });
}

export async function getSessionEntities(sessionId: string): Promise<{
  orders: Order[];
  positions: Position[];
  trades: Trade[];
}> {
  const [orders, positions, trades] = await Promise.all([
    db.orders.where('sessionId').equals(sessionId).toArray(),
    db.positions.where('sessionId').equals(sessionId).toArray(),
    db.trades.where('sessionId').equals(sessionId).toArray()
  ]);

  return { orders, positions, trades };
}

export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  await db.journalEntries.put(entry);
}

export async function getJournalEntries(sessionId: string): Promise<JournalEntry[]> {
  return db.journalEntries.where('sessionId').equals(sessionId).reverse().sortBy('timestamp');
}

export async function saveAnalyticsSnapshot(snapshot: AnalyticsSnapshot): Promise<void> {
  await db.analyticsSnapshots.put(snapshot);
}

export { db };
