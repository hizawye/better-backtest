import { createStore } from 'zustand/vanilla';
import { writable, type Readable } from 'svelte/store';
import type {
  AnalyticsSnapshot,
  BacktestSession,
  Bar,
  CrossSessionAnalytics,
  DrawingEntity,
  DrawingStyle,
  DrawingToolType,
  JournalEntry,
  Order,
  Position,
  SessionEvent,
  Tick,
  ToolDockSection,
  Timeframe,
  Trade,
  TradingPair,
  WorkspaceBottomTab,
  WorkspaceRightTab
} from '$shared/types';

interface TradingState {
  // Session
  sessionId: string;
  sessionName: string;
  currentPair: TradingPair;
  currentTimeframe: Timeframe;
  rangeFrom: number;
  rangeTo: number;

  // Market data
  currentBar: Bar | null;
  currentTick: Tick | null;
  bars: Bar[];
  sourceBars: Bar[];

  // Chart tools
  drawings: DrawingEntity[];
  activeTool: DrawingToolType;
  selectedDrawingId: string | null;
  magnetEnabled: boolean;
  drawingsVisible: boolean;
  toolStylePresets: Partial<Record<Exclude<DrawingToolType, 'cursor' | 'risk_position'>, DrawingStyle>>;

  // Workspace UI
  watchlistVisible: boolean;
  rightDrawerOpen: boolean;
  rightDrawerTab: WorkspaceRightTab;
  bottomDrawerOpen: boolean;
  bottomDrawerTab: WorkspaceBottomTab;
  compactToolbar: boolean;
  toolDockOpen: boolean;
  toolDockSection: ToolDockSection;

  // Trading
  positions: Position[];
  orders: Order[];
  trades: Trade[];
  journalEntries: JournalEntry[];
  sessionEvents: SessionEvent[];
  analyticsSnapshot: AnalyticsSnapshot | null;
  crossSessionAnalytics: CrossSessionAnalytics | null;
  balance: number;
  equity: number;
  peakEquity: number;
  maxDrawdown: number;

  // Costs and execution assumptions
  spread: number;
  slippage: number;
  commissionPerLot: number;

  // Replay state
  isPlaying: boolean;
  speed: number;
  currentIndex: number;
  totalBars: number;

  // Actions
  applySession: (session: BacktestSession) => void;
  setSessionMeta: (sessionId: string, sessionName: string) => void;
  setCurrentPair: (pair: TradingPair) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setDateRange: (from: number, to: number) => void;

  setCurrentBar: (bar: Bar | null) => void;
  setCurrentTick: (tick: Tick | null) => void;
  setBars: (bars: Bar[]) => void;
  setSourceBars: (bars: Bar[]) => void;

  setDrawings: (drawings: DrawingEntity[]) => void;
  addDrawing: (drawing: DrawingEntity) => void;
  updateDrawing: (id: string, updates: Partial<DrawingEntity>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: () => void;
  setActiveTool: (tool: DrawingToolType) => void;
  setSelectedDrawing: (id: string | null) => void;
  setMagnetEnabled: (enabled: boolean) => void;
  setDrawingsVisible: (visible: boolean) => void;
  setToolStylePreset: (
    tool: Exclude<DrawingToolType, 'cursor' | 'risk_position'>,
    style: DrawingStyle
  ) => void;
  setToolStylePresets: (
    styles: Partial<Record<Exclude<DrawingToolType, 'cursor' | 'risk_position'>, DrawingStyle>>
  ) => void;

  setWatchlistVisible: (visible: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  setRightDrawerTab: (tab: WorkspaceRightTab) => void;
  setBottomDrawerOpen: (open: boolean) => void;
  setBottomDrawerTab: (tab: WorkspaceBottomTab) => void;
  setCompactToolbar: (compact: boolean) => void;
  setToolDockOpen: (open: boolean) => void;
  setToolDockSection: (section: ToolDockSection) => void;

  setPositions: (positions: Position[]) => void;
  addPosition: (position: Position) => void;
  removePosition: (id: string) => void;

  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  removeOrder: (id: string) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;

  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;

  setJournalEntries: (entries: JournalEntry[]) => void;
  addJournalEntry: (entry: JournalEntry) => void;
  setSessionEvents: (events: SessionEvent[]) => void;
  addSessionEvent: (event: SessionEvent) => void;
  setAnalyticsSnapshot: (snapshot: AnalyticsSnapshot | null) => void;
  setCrossSessionAnalytics: (snapshot: CrossSessionAnalytics | null) => void;

  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setProgress: (index: number, total: number) => void;

  setBalance: (amount: number) => void;
  updateBalance: (amount: number) => void;
  setEquity: (equity: number) => void;
  updateEquity: (equity: number) => void;

  setExecutionConfig: (config: {
    spread?: number;
    slippage?: number;
    commissionPerLot?: number;
  }) => void;

  resetForReplay: () => void;
  hardReset: () => void;
}

const now = Date.now();
const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

const store = createStore<TradingState>((set) => ({
  // Initial state
  sessionId: '',
  sessionName: 'Untitled Session',
  currentPair: 'NAS100',
  currentTimeframe: 'M1',
  rangeFrom: weekAgo,
  rangeTo: now,

  currentBar: null,
  currentTick: null,
  bars: [],
  sourceBars: [],
  drawings: [],
  activeTool: 'cursor',
  selectedDrawingId: null,
  magnetEnabled: false,
  drawingsVisible: true,
  toolStylePresets: {},
  watchlistVisible: true,
  rightDrawerOpen: false,
  rightDrawerTab: 'order',
  bottomDrawerOpen: false,
  bottomDrawerTab: 'positions',
  compactToolbar: false,
  toolDockOpen: true,
  toolDockSection: 'tools',

  positions: [],
  orders: [],
  trades: [],
  journalEntries: [],
  sessionEvents: [],
  analyticsSnapshot: null,
  crossSessionAnalytics: null,
  balance: 10000,
  equity: 10000,
  peakEquity: 10000,
  maxDrawdown: 0,

  spread: 2,
  slippage: 0.3,
  commissionPerLot: 0,

  isPlaying: false,
  speed: 1,
  currentIndex: 0,
  totalBars: 0,

  applySession: (session) =>
    set({
      sessionId: session.id,
      sessionName: session.name,
      currentPair: session.config.pair,
      currentTimeframe: session.config.timeframe,
      rangeFrom: session.config.from,
      rangeTo: session.config.to,
      balance: session.config.startingBalance,
      equity: session.config.startingBalance,
      peakEquity: session.config.startingBalance,
      maxDrawdown: 0,
      spread: session.config.execution.spread,
      slippage: session.config.execution.slippage,
      commissionPerLot: session.config.execution.commissionPerLot,
      currentIndex: session.lastReplayIndex
    }),

  setSessionMeta: (sessionId, sessionName) => set({ sessionId, sessionName }),
  setCurrentPair: (pair) => set({ currentPair: pair }),
  setTimeframe: (timeframe) => set({ currentTimeframe: timeframe }),
  setDateRange: (rangeFrom, rangeTo) => set({ rangeFrom, rangeTo }),

  setCurrentBar: (bar) => set({ currentBar: bar }),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  setBars: (bars) => set({ bars, totalBars: bars.length }),
  setSourceBars: (bars) => set({ sourceBars: bars }),
  setDrawings: (drawings) => set({ drawings }),
  addDrawing: (drawing) =>
    set((state) => ({ drawings: [...state.drawings, drawing] })),
  updateDrawing: (id, updates) =>
    set((state) => ({
      drawings: state.drawings.map((drawing) =>
        drawing.id === id ? { ...drawing, ...updates } : drawing
      )
    })),
  removeDrawing: (id) =>
    set((state) => ({
      drawings: state.drawings.filter((drawing) => drawing.id !== id),
      selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId
    })),
  clearDrawings: () => set({ drawings: [], selectedDrawingId: null }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectedDrawing: (selectedDrawingId) => set({ selectedDrawingId }),
  setMagnetEnabled: (magnetEnabled) => set({ magnetEnabled }),
  setDrawingsVisible: (drawingsVisible) => set({ drawingsVisible }),
  setToolStylePreset: (tool, style) =>
    set((state) => ({
      toolStylePresets: {
        ...state.toolStylePresets,
        [tool]: style
      }
    })),
  setToolStylePresets: (toolStylePresets) => set({ toolStylePresets }),
  setWatchlistVisible: (watchlistVisible) => set({ watchlistVisible }),
  setRightDrawerOpen: (rightDrawerOpen) => set({ rightDrawerOpen }),
  setRightDrawerTab: (rightDrawerTab) => set({ rightDrawerTab }),
  setBottomDrawerOpen: (bottomDrawerOpen) => set({ bottomDrawerOpen }),
  setBottomDrawerTab: (bottomDrawerTab) => set({ bottomDrawerTab }),
  setCompactToolbar: (compactToolbar) => set({ compactToolbar }),
  setToolDockOpen: (toolDockOpen) => set({ toolDockOpen }),
  setToolDockSection: (toolDockSection) => set({ toolDockSection }),

  setPositions: (positions) => set({ positions }),
  addPosition: (position) =>
    set((state) => ({ positions: [...state.positions, position] })),
  removePosition: (id) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id)
    })),

  setOrders: (orders) => set({ orders }),
  addOrder: (order) => set((state) => ({ orders: [...state.orders, order] })),
  removeOrder: (id) =>
    set((state) => ({ orders: state.orders.filter((o) => o.id !== id) })),
  updateOrder: (id, updates) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === id ? { ...o, ...updates } : o))
    })),

  setTrades: (trades) => set({ trades }),
  addTrade: (trade) => set((state) => ({ trades: [...state.trades, trade] })),

  setJournalEntries: (journalEntries) => set({ journalEntries }),
  addJournalEntry: (entry) =>
    set((state) => ({ journalEntries: [...state.journalEntries, entry] })),
  setSessionEvents: (sessionEvents) => set({ sessionEvents }),
  addSessionEvent: (event) =>
    set((state) => ({ sessionEvents: [...state.sessionEvents, event] })),
  setAnalyticsSnapshot: (analyticsSnapshot) => set({ analyticsSnapshot }),
  setCrossSessionAnalytics: (crossSessionAnalytics) => set({ crossSessionAnalytics }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setSpeed: (speed) => set({ speed }),
  setProgress: (index, total) => set({ currentIndex: index, totalBars: total }),

  setBalance: (balance) => set({ balance }),
  updateBalance: (amount) => set((state) => ({ balance: state.balance + amount })),
  setEquity: (equity) => set({ equity }),
  updateEquity: (equity) =>
    set((state) => {
      const peakEquity = Math.max(state.peakEquity, equity);
      const drawdown = peakEquity - equity;
      const maxDrawdown = Math.max(state.maxDrawdown, drawdown);
      return { equity, peakEquity, maxDrawdown };
    }),

  setExecutionConfig: (config) =>
    set((state) => ({
      spread: config.spread ?? state.spread,
      slippage: config.slippage ?? state.slippage,
      commissionPerLot: config.commissionPerLot ?? state.commissionPerLot
    })),

  resetForReplay: () =>
    set((state) => ({
      currentBar: null,
      currentTick: null,
      isPlaying: false,
      currentIndex: 0,
      totalBars: state.bars.length
    })),

  hardReset: () =>
    set((state) => ({
      currentBar: null,
      currentTick: null,
      bars: [],
      sourceBars: [],
      drawings: [],
      activeTool: 'cursor',
      selectedDrawingId: null,
      magnetEnabled: false,
      drawingsVisible: true,
      toolStylePresets: {},
      watchlistVisible: true,
      rightDrawerOpen: false,
      rightDrawerTab: 'order',
      bottomDrawerOpen: false,
      bottomDrawerTab: 'positions',
      compactToolbar: false,
      toolDockOpen: true,
      toolDockSection: 'tools',
      positions: [],
      orders: [],
      trades: [],
      journalEntries: [],
      sessionEvents: [],
      analyticsSnapshot: null,
      crossSessionAnalytics: null,
      balance: 10000,
      equity: 10000,
      peakEquity: 10000,
      maxDrawdown: 0,
      isPlaying: false,
      speed: 1,
      currentIndex: 0,
      totalBars: 0,
      rangeTo: Date.now(),
      rangeFrom: Date.now() - 7 * 24 * 60 * 60 * 1000,
      spread: state.currentPair === 'NAS100' ? 2 : 0.00015,
      slippage: 0.3,
      commissionPerLot: 0
    }))
}));

function zustandToSvelte<T>(zustandStore: any): Readable<T> & T {
  const { subscribe } = writable(zustandStore.getState(), (set) => zustandStore.subscribe(set));

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
