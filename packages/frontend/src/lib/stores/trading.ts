import { createStore } from 'zustand/vanilla';
import { writable, derived, type Readable } from 'svelte/store';
import type { Bar, Tick, Position, Order, Trade, TradingPair } from '$shared/types';

interface TradingState {
  // Market data
  currentPair: TradingPair;
  currentBar: Bar | null;
  currentTick: Tick | null;
  bars: Bar[];

  // Trading
  positions: Position[];
  orders: Order[];
  trades: Trade[];
  balance: number;
  equity: number;

  // Replay state
  isPlaying: boolean;
  speed: number;
  currentIndex: number;
  totalBars: number;

  // Actions
  setCurrentPair: (pair: TradingPair) => void;
  setCurrentBar: (bar: Bar) => void;
  setCurrentTick: (tick: Tick) => void;
  setBars: (bars: Bar[]) => void;

  addPosition: (position: Position) => void;
  removePosition: (id: string) => void;
  updatePositions: (positions: Position[]) => void;

  addOrder: (order: Order) => void;
  removeOrder: (id: string) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;

  addTrade: (trade: Trade) => void;

  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setProgress: (index: number, total: number) => void;

  updateBalance: (amount: number) => void;
  updateEquity: (equity: number) => void;

  reset: () => void;
}

const store = createStore<TradingState>((set) => ({
  // Initial state
  currentPair: 'EURUSD',
  currentBar: null,
  currentTick: null,
  bars: [],

  positions: [],
  orders: [],
  trades: [],
  balance: 10000,
  equity: 10000,

  isPlaying: false,
  speed: 1,
  currentIndex: 0,
  totalBars: 0,

  // Actions
  setCurrentPair: (pair) => set({ currentPair: pair }),
  setCurrentBar: (bar) => set({ currentBar: bar }),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  setBars: (bars) => set({ bars, totalBars: bars.length }),

  addPosition: (position) =>
    set((state) => ({ positions: [...state.positions, position] })),

  removePosition: (id) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id)
    })),

  updatePositions: (positions) => set({ positions }),

  addOrder: (order) =>
    set((state) => ({ orders: [...state.orders, order] })),

  removeOrder: (id) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== id)
    })),

  updateOrder: (id, updates) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === id ? { ...o, ...updates } : o
      )
    })),

  addTrade: (trade) =>
    set((state) => ({ trades: [...state.trades, trade] })),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setSpeed: (speed) => set({ speed }),
  setProgress: (index, total) =>
    set({ currentIndex: index, totalBars: total }),

  updateBalance: (amount) =>
    set((state) => ({ balance: state.balance + amount })),

  updateEquity: (equity) => set({ equity }),

  reset: () =>
    set({
      currentBar: null,
      currentTick: null,
      positions: [],
      orders: [],
      trades: [],
      balance: 10000,
      equity: 10000,
      isPlaying: false,
      currentIndex: 0
    })
}));

// Convert Zustand store to Svelte store
function zustandToSvelte<T>(zustandStore: any): Readable<T> & T {
  const { subscribe } = writable(zustandStore.getState(), (set) => {
    return zustandStore.subscribe(set);
  });

  return new Proxy(
    { subscribe } as any,
    {
      get(target, prop) {
        if (prop === 'subscribe') return target.subscribe;
        return zustandStore.getState()[prop];
      }
    }
  );
}

export const tradingStore = zustandToSvelte<TradingState>(store);
