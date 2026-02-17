<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
  import type {
    Bar,
    DrawingEntity,
    DrawingPoint,
    DrawingToolType,
    Position,
    RiskOverlayMetrics,
    RiskToolDraft,
    Timeframe
  } from '$shared/types';
  import {
    createDefaultDrawingStyle,
    getLineDash,
    hitTestDrawing,
    isDrawingTool,
    requiredPointCount,
    snapTimestampToBars,
    type HitTestResult,
    type ScreenPoint
  } from '$lib/engine/chart-tools';
  import {
    normalizeChartSize,
    shouldApplyChartResize,
    type ChartSize
  } from '$lib/utils/chart-resize';

  export let bars: Bar[] = [];
  export let currentBar: Bar | null = null;
  export let timeframe: Timeframe = 'M1';
  export let pair = 'NAS100';
  export let sessionId = '';
  export let drawings: DrawingEntity[] = [];
  export let activeTool: DrawingToolType = 'cursor';
  export let selectedDrawingId: string | null = null;
  export let magnetEnabled = false;
  export let drawingsVisible = true;
  export let positions: Position[] = [];
  export let riskDraft: RiskToolDraft | null = null;
  export let riskDraftSeed: DrawingPoint | null = null;
  export let riskOverlayMetrics: RiskOverlayMetrics | null = null;

  export let onCreateDrawing: ((drawing: DrawingEntity) => void) | undefined = undefined;
  export let onUpdateDrawing: ((drawing: DrawingEntity) => void) | undefined = undefined;
  export let onDeleteDrawing: ((drawingId: string) => void) | undefined = undefined;
  export let onSelectDrawing: ((drawingId: string | null) => void) | undefined = undefined;
  export let onRiskDraftPoint: ((point: DrawingPoint) => void) | undefined = undefined;
  export let onRiskDraftAdjust: ((patch: Partial<RiskToolDraft>) => void) | undefined = undefined;
  export let onPositionLevelDrag:
    | ((payload: { positionId: string; level: 'stopLoss' | 'takeProfit'; price: number }) => void)
    | undefined = undefined;

  let chartContainer: HTMLDivElement;
  let chartOverlay: SVGSVGElement;
  let chart: IChartApi | null = null;
  let candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrameId: number | null = null;
  let pendingSize: ChartSize | null = null;
  let lastAppliedSize: ChartSize | null = null;
  let lastDataSignature: string | null = null;
  let resizeWindowStart = 0;
  let resizeWindowCount = 0;
  let overlayWidth = 0;
  let overlayHeight = 0;

  let draftTool: Exclude<DrawingToolType, 'cursor' | 'risk_position'> | null = null;
  let draftPoints: DrawingPoint[] = [];
  let isPointerDown = false;
  let dragContext:
    | {
        mode: 'move' | 'resize';
        drawingId: string;
        pointIndex: number | null;
        startAnchor: DrawingPoint;
        originalPoints: DrawingPoint[];
      }
    | {
        mode: 'position-level';
        positionId: string;
        level: 'stopLoss' | 'takeProfit';
      }
    | {
        mode: 'risk-draft';
        target: 'entry' | 'stop' | 'take-profit';
      }
    | null = null;
  let modifierDrawMode = false;
  let dragUpdateFrameId: number | null = null;
  let pendingDrawingUpdate: DrawingEntity | null = null;
  let riskDraftUpdateFrameId: number | null = null;
  let pendingRiskPatch: Partial<RiskToolDraft> | null = null;

  const RESIZE_LOG_THRESHOLD = 120;
  const shouldLogResizeWarnings =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  $: sortedDrawings = drawings
    .filter((drawing) => !drawing.hidden)
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.updatedAt - b.updatedAt);
  $: draftDrawing = deriveDraftDrawing();
  $: overlayInteractive =
    modifierDrawMode ||
    isDrawingTool(activeTool) ||
    activeTool === 'risk_position' ||
    riskDraft !== null ||
    dragContext !== null ||
    draftTool !== null;

  function queueResize(width: number, height: number) {
    const nextSize = normalizeChartSize(width, height);
    if (!shouldApplyChartResize(nextSize, lastAppliedSize)) {
      return;
    }

    pendingSize = nextSize;
    if (resizeFrameId !== null) {
      return;
    }

    resizeFrameId = requestAnimationFrame(() => {
      resizeFrameId = null;
      if (!chart || !pendingSize) {
        return;
      }

      chart.resize(pendingSize.width, pendingSize.height);
      overlayWidth = pendingSize.width;
      overlayHeight = pendingSize.height;
      lastAppliedSize = pendingSize;
      pendingSize = null;
    });
  }

  function getDataSignature(localBars: Bar[], currentTimeframe: Timeframe): string {
    if (localBars.length === 0) return `empty:${currentTimeframe}`;
    const firstTimestamp = localBars[0].timestamp;
    const lastTimestamp = localBars[localBars.length - 1].timestamp;
    return `${currentTimeframe}:${localBars.length}:${firstTimestamp}:${lastTimestamp}`;
  }

  function pointerInChart(event: PointerEvent): ScreenPoint {
    const bounds = chartContainer.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
    };
  }

  function pointerToAnchor(event: PointerEvent): DrawingPoint | null {
    if (!chart || !candlestickSeries) return null;
    const pointer = pointerInChart(event);
    const timeValue = chart.timeScale().coordinateToTime(pointer.x as number);
    const fallbackTimestamp = currentBar?.timestamp ?? bars[bars.length - 1]?.timestamp ?? Date.now();

    let timestamp = fallbackTimestamp;
    if (typeof timeValue === 'number') {
      timestamp = Math.floor(timeValue * 1000);
    }

    const forceMagnet = magnetEnabled || event.ctrlKey;
    if (forceMagnet) {
      timestamp = snapTimestampToBars(timestamp, bars);
    }

    const priceValue = candlestickSeries.coordinateToPrice(pointer.y);
    const fallbackPrice = currentBar?.close ?? bars[bars.length - 1]?.close ?? 0;
    const price = typeof priceValue === 'number' ? priceValue : fallbackPrice;

    return {
      timestamp,
      price
    };
  }

  function pointToScreen(point: DrawingPoint): ScreenPoint | null {
    if (!chart || !candlestickSeries) return null;
    const timeCoord = chart.timeScale().timeToCoordinate(Math.floor(point.timestamp / 1000) as any);
    const priceCoord = candlestickSeries.priceToCoordinate(point.price);
    if (timeCoord === null || priceCoord === null) return null;
    return { x: timeCoord, y: priceCoord };
  }

  function generateDrawingId(): string {
    return `draw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function deriveDraftDrawing(): DrawingEntity | null {
    if (!draftTool || draftPoints.length === 0) return null;
    const normalizedPoints = draftTool === 'horizontal_line'
      ? [{ ...draftPoints[0] }]
      : draftTool === 'vertical_line'
        ? [{ ...draftPoints[0] }]
        : [...draftPoints];

    return {
      id: '__draft__',
      sessionId,
      pair: pair as DrawingEntity['pair'],
      tool: draftTool,
      points: normalizedPoints,
      style: createDefaultDrawingStyle(draftTool),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function commitDrawingFromDraft(): void {
    if (!draftTool || draftPoints.length === 0 || !onCreateDrawing) return;
    const pointRequirement = requiredPointCount(draftTool);
    if (draftPoints.length < pointRequirement) return;
    const points = draftTool === 'brush' ? [...draftPoints] : draftPoints.slice(0, pointRequirement);

    onCreateDrawing({
      id: generateDrawingId(),
      sessionId,
      pair: pair as DrawingEntity['pair'],
      tool: draftTool,
      points,
      style: createDefaultDrawingStyle(draftTool),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hidden: false,
      locked: false,
      zIndex: Date.now()
    });

    draftTool = null;
    draftPoints = [];
  }

  function pickDrawingHit(event: PointerEvent): { drawing: DrawingEntity; hit: HitTestResult } | null {
    const pointer = pointerInChart(event);
    for (let index = sortedDrawings.length - 1; index >= 0; index -= 1) {
      const drawing = sortedDrawings[index];
      const hit = hitTestDrawing(drawing, pointer, pointToScreen);
      if (hit.hit) {
        return { drawing, hit };
      }
    }
    return null;
  }

  function startDrawingMode(anchor: DrawingPoint) {
    if (!isDrawingTool(activeTool)) return;

    if (activeTool === 'brush') {
      draftTool = activeTool;
      draftPoints = [anchor];
      return;
    }

    if (!draftTool || draftTool !== activeTool) {
      draftTool = activeTool;
      draftPoints = [anchor];
      if (requiredPointCount(activeTool) === 1) {
        commitDrawingFromDraft();
      }
      return;
    }

    const pointRequirement = requiredPointCount(activeTool);
    if (draftPoints.length < pointRequirement) {
      draftPoints = [...draftPoints, anchor];
      if (draftPoints.length >= pointRequirement) {
        commitDrawingFromDraft();
      }
      return;
    }

    draftPoints = [anchor];
  }

  function isSameAnchor(a: DrawingPoint, b: DrawingPoint): boolean {
    return a.timestamp === b.timestamp && Math.abs(a.price - b.price) <= 0.0000001;
  }

  function areSamePoints(a: DrawingPoint[], b: DrawingPoint[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!isSameAnchor(a[i], b[i])) return false;
    }
    return true;
  }

  function scheduleDrawingUpdate(nextDrawing: DrawingEntity) {
    if (!onUpdateDrawing) return;
    pendingDrawingUpdate = nextDrawing;
    if (dragUpdateFrameId !== null) return;
    dragUpdateFrameId = requestAnimationFrame(() => {
      dragUpdateFrameId = null;
      if (!pendingDrawingUpdate || !onUpdateDrawing) return;
      onUpdateDrawing(pendingDrawingUpdate);
      pendingDrawingUpdate = null;
    });
  }

  function flushPendingDrawingUpdate() {
    if (!pendingDrawingUpdate || !onUpdateDrawing) return;
    onUpdateDrawing(pendingDrawingUpdate);
    pendingDrawingUpdate = null;
  }

  function scheduleRiskDraftAdjust(patch: Partial<RiskToolDraft>) {
    if (!onRiskDraftAdjust) return;
    pendingRiskPatch = patch;
    if (riskDraftUpdateFrameId !== null) return;
    riskDraftUpdateFrameId = requestAnimationFrame(() => {
      riskDraftUpdateFrameId = null;
      if (!pendingRiskPatch || !onRiskDraftAdjust) return;
      onRiskDraftAdjust(pendingRiskPatch);
      pendingRiskPatch = null;
    });
  }

  function flushRiskDraftAdjust() {
    if (!pendingRiskPatch || !onRiskDraftAdjust) return;
    onRiskDraftAdjust(pendingRiskPatch);
    pendingRiskPatch = null;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function pickRiskDraftHandle(event: PointerEvent): 'entry' | 'stop' | 'take-profit' | null {
    if (!riskDraft || !candlestickSeries) return null;
    const pointer = pointerInChart(event);
    const threshold = 8;
    const handleRadius = 10;
    const leftHandleX = 12;
    const rightHandleX = Math.max(12, overlayWidth - 12);
    const centerX = overlayWidth / 2;

    const entryY = candlestickSeries.priceToCoordinate(riskDraft.entry.price);
    const stopY = candlestickSeries.priceToCoordinate(riskDraft.stop.price);
    const targetPrice = typeof riskDraft.takeProfit?.price === 'number' ? riskDraft.takeProfit.price : null;
    const targetY = targetPrice !== null ? candlestickSeries.priceToCoordinate(targetPrice) : null;

    const nearHandle = (x: number, y: number) =>
      Math.hypot(pointer.x - x, pointer.y - y) <= handleRadius;

    if (typeof targetY === 'number') {
      if (
        nearHandle(leftHandleX, targetY) ||
        nearHandle(rightHandleX, targetY) ||
        (Math.abs(pointer.y - targetY) <= threshold &&
          pointer.x >= leftHandleX &&
          pointer.x <= rightHandleX)
      ) {
        return 'take-profit';
      }
    }

    if (
      typeof entryY === 'number' &&
      (nearHandle(centerX, entryY) ||
        (Math.abs(pointer.y - entryY) <= threshold && Math.abs(pointer.x - centerX) <= 32))
    ) {
      return 'entry';
    }

    if (typeof stopY === 'number') {
      if (
        nearHandle(leftHandleX, stopY) ||
        nearHandle(rightHandleX, stopY) ||
        (Math.abs(pointer.y - stopY) <= threshold &&
          pointer.x >= leftHandleX &&
          pointer.x <= rightHandleX)
      ) {
        return 'stop';
      }
    }

    return null;
  }

  function handleOverlayPointerDown(event: PointerEvent) {
    if (!overlayInteractive) return;
    isPointerDown = true;
    const anchor = pointerToAnchor(event);
    if (!anchor) return;

    const riskHit = pickRiskDraftHandle(event);
    if (riskHit) {
      dragContext = {
        mode: 'risk-draft',
        target: riskHit
      };
      return;
    }

    if (activeTool === 'risk_position') {
      onRiskDraftPoint?.(anchor);
      return;
    }

    if (isDrawingTool(activeTool)) {
      startDrawingMode(anchor);
      return;
    }

    const levelHit = pickPositionLevelHit(event);
    if (levelHit) {
      dragContext = {
        mode: 'position-level',
        positionId: levelHit.positionId,
        level: levelHit.level
      };
      return;
    }

    const hit = pickDrawingHit(event);
    if (!hit) {
      onSelectDrawing?.(null);
      return;
    }

    onSelectDrawing?.(hit.drawing.id);

    if (hit.drawing.locked) {
      return;
    }

    if (hit.hit.part === 'handle' && hit.hit.pointIndex !== null) {
      dragContext = {
        mode: 'resize',
        drawingId: hit.drawing.id,
        pointIndex: hit.hit.pointIndex,
        startAnchor: anchor,
        originalPoints: hit.drawing.points.map((point) => ({ ...point }))
      };
      return;
    }

    dragContext = {
      mode: 'move',
      drawingId: hit.drawing.id,
      pointIndex: null,
      startAnchor: anchor,
      originalPoints: hit.drawing.points.map((point) => ({ ...point }))
    };
  }

  function updateDraftPreview(anchor: DrawingPoint) {
    if (!draftTool) return;
    if (draftTool === 'brush') {
      const lastPoint = draftPoints[draftPoints.length - 1];
      if (!lastPoint) {
        draftPoints = [anchor];
        return;
      }
      const timestampDistance = Math.abs(anchor.timestamp - lastPoint.timestamp);
      const priceDistance = Math.abs(anchor.price - lastPoint.price);
      if (timestampDistance >= 20_000 || priceDistance >= 0.08) {
        draftPoints = [...draftPoints, anchor];
      }
      return;
    }

    if (requiredPointCount(draftTool) <= 1) return;
    if (draftPoints.length === 1) {
      draftPoints = [draftPoints[0], anchor];
      return;
    }
    draftPoints[draftPoints.length - 1] = anchor;
  }

  function handleDrawingDrag(anchor: DrawingPoint) {
    if (!dragContext || dragContext.mode === 'position-level' || dragContext.mode === 'risk-draft' || !onUpdateDrawing) return;
    const context = dragContext;
    const drawing = drawings.find((item) => item.id === context.drawingId);
    if (!drawing) return;

    const deltaTimestamp = anchor.timestamp - context.startAnchor.timestamp;
    const deltaPrice = anchor.price - context.startAnchor.price;

    let nextPoints = context.originalPoints.map((point) => ({ ...point }));
    if (context.mode === 'resize' && context.pointIndex !== null) {
      nextPoints[context.pointIndex] = anchor;
    } else {
      nextPoints = nextPoints.map((point) => ({
        timestamp: point.timestamp + deltaTimestamp,
        price: point.price + deltaPrice
      }));
    }

    if (areSamePoints(nextPoints, drawing.points)) return;

    scheduleDrawingUpdate({
      ...drawing,
      points: nextPoints,
      updatedAt: Date.now()
    });
  }

  function handlePositionLevelDrag(anchor: DrawingPoint) {
    if (!dragContext || dragContext.mode !== 'position-level') return;
    onPositionLevelDrag?.({
      positionId: dragContext.positionId,
      level: dragContext.level,
      price: anchor.price
    });
  }

  function handleRiskDraftDrag(anchor: DrawingPoint) {
    if (!dragContext || dragContext.mode !== 'risk-draft' || !riskDraft) return;
    if (dragContext.target === 'entry') {
      scheduleRiskDraftAdjust({
        entry: {
          ...riskDraft.entry,
          price: anchor.price
        }
      });
      return;
    }

    if (dragContext.target === 'stop') {
      scheduleRiskDraftAdjust({
        stop: {
          ...riskDraft.stop,
          price: anchor.price
        }
      });
      return;
    }

    scheduleRiskDraftAdjust({
      takeProfit: {
        timestamp: riskDraft.entry.timestamp,
        price: anchor.price
      }
    });
  }

  function pickPositionLevelHit(event: PointerEvent): { positionId: string; level: 'stopLoss' | 'takeProfit' } | null {
    const pointer = pointerInChart(event);
    const threshold = 7;

    for (const position of positions) {
      if (typeof position.stopLoss === 'number') {
        const y = candlestickSeries?.priceToCoordinate(position.stopLoss);
        if (typeof y === 'number' && Math.abs(pointer.y - y) <= threshold) {
          return { positionId: position.id, level: 'stopLoss' };
        }
      }

      if (typeof position.takeProfit === 'number') {
        const y = candlestickSeries?.priceToCoordinate(position.takeProfit);
        if (typeof y === 'number' && Math.abs(pointer.y - y) <= threshold) {
          return { positionId: position.id, level: 'takeProfit' };
        }
      }
    }

    return null;
  }

  function handleOverlayPointerMove(event: PointerEvent) {
    if (!overlayInteractive && !dragContext) return;
    const anchor = pointerToAnchor(event);
    if (!anchor) return;

    if (draftTool && isPointerDown) {
      updateDraftPreview(anchor);
    }

    if (dragContext) {
      if (dragContext.mode === 'position-level') {
        handlePositionLevelDrag(anchor);
      } else if (dragContext.mode === 'risk-draft') {
        handleRiskDraftDrag(anchor);
      } else {
        handleDrawingDrag(anchor);
      }
      return;
    }

    if ((activeTool === 'cursor' || modifierDrawMode) && isPointerDown) {
      const levelHit = pickPositionLevelHit(event);
      if (levelHit) {
        dragContext = {
          mode: 'position-level',
          positionId: levelHit.positionId,
          level: levelHit.level
        };
      }
    }
  }

  function handleOverlayPointerUp() {
    if (draftTool === 'brush' && draftPoints.length > 1) {
      commitDrawingFromDraft();
    }
    isPointerDown = false;
    flushPendingDrawingUpdate();
    flushRiskDraftAdjust();
    dragContext = null;
  }

  function lineCoordinates(points: ScreenPoint[], tool: DrawingEntity['tool']) {
    if (points.length < 1) return null;

    if (tool === 'horizontal_line') {
      const y = points[0].y;
      return { x1: 0, y1: y, x2: overlayWidth, y2: y };
    }

    if (tool === 'vertical_line') {
      const x = points[0].x;
      return { x1: x, y1: 0, x2: x, y2: overlayHeight };
    }

    if (points.length < 2) return null;
    const [a, b] = points;

    if (tool === 'extended_line' || tool === 'ray') {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) < 0.001) {
        return { x1: a.x, y1: 0, x2: a.x, y2: overlayHeight };
      }

      const slope = dy / dx;
      const yAtLeft = a.y + slope * (0 - a.x);
      const yAtRight = a.y + slope * (overlayWidth - a.x);

      if (tool === 'extended_line') {
        return { x1: 0, y1: yAtLeft, x2: overlayWidth, y2: yAtRight };
      }

      const fromAtoB = dx >= 0 ? 1 : -1;
      if (fromAtoB > 0) {
        return { x1: a.x, y1: a.y, x2: overlayWidth, y2: yAtRight };
      }
      return { x1: 0, y1: yAtLeft, x2: a.x, y2: a.y };
    }

    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  function renderLevels(drawing: DrawingEntity, points: ScreenPoint[]) {
    if (drawing.tool !== 'fibonacci' || points.length < 2) return [];
    const [a, b] = points;
    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    return ratios.map((ratio) => {
      const y = a.y + (b.y - a.y) * ratio;
      return { ratio, y };
    });
  }

  function screenPointsForDrawing(drawing: DrawingEntity): ScreenPoint[] {
    return drawing.points
      .map(pointToScreen)
      .filter((point): point is ScreenPoint => point !== null);
  }

  function styleForTool(drawing: DrawingEntity): string {
    const dash = getLineDash(drawing.style);
    const fillOpacity = drawing.style.fillOpacity ?? 0.12;
    return `stroke:${drawing.style.color};stroke-width:${drawing.style.lineWidth};${dash ? `stroke-dasharray:${dash};` : ''}fill:${drawing.style.fillColor ?? 'transparent'};fill-opacity:${fillOpacity};`;
  }

  function selectedHandleStyle(drawing: DrawingEntity): string {
    return `fill:${drawing.style.color};stroke:#f8fafc;stroke-width:1;`;
  }

  function handleDeleteKey(event: KeyboardEvent) {
    if (!selectedDrawingId) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDeleteDrawing?.(selectedDrawingId);
      onSelectDrawing?.(null);
    }

    if (event.key === 'Escape') {
      draftTool = null;
      draftPoints = [];
    }
  }

  function handleToolModifierKey(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Shift') {
      modifierDrawMode = event.type === 'keydown';
    }
  }

  onMount(() => {
    const initialSize = normalizeChartSize(chartContainer.clientWidth, chartContainer.clientHeight);
    chart = createChart(chartContainer, {
      width: Math.max(initialSize.width, 1),
      height: Math.max(initialSize.height, 1),
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc'
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' }
      },
      crosshair: {
        mode: 1
      },
      rightPriceScale: {
        borderColor: '#2a2e39'
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false
      }
    });

    candlestickSeries = chart.addCandlestickSeries({
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645'
    });

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const width = entry?.contentRect.width ?? chartContainer.clientWidth;
      const height = entry?.contentRect.height ?? chartContainer.clientHeight;

      if (shouldLogResizeWarnings) {
        const now = performance.now();
        if (now - resizeWindowStart > 1000) {
          resizeWindowStart = now;
          resizeWindowCount = 0;
        }
        resizeWindowCount += 1;
        if (resizeWindowCount === RESIZE_LOG_THRESHOLD) {
          console.warn(
            '[chart] high resize frequency detected; suppressing additional warnings for this second'
          );
        }
      }

      if (chart && chartContainer) {
        queueResize(width, height);
      }
    });
    resizeObserver.observe(chartContainer);
    queueResize(chartContainer.clientWidth, chartContainer.clientHeight);

    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    };
  });

  onDestroy(() => {
    if (resizeFrameId !== null) {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = null;
    }
    if (dragUpdateFrameId !== null) {
      cancelAnimationFrame(dragUpdateFrameId);
      dragUpdateFrameId = null;
    }
    if (riskDraftUpdateFrameId !== null) {
      cancelAnimationFrame(riskDraftUpdateFrameId);
      riskDraftUpdateFrameId = null;
    }
    pendingDrawingUpdate = null;
    pendingRiskPatch = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (chart) {
      chart.remove();
    }
    chart = null;
    candlestickSeries = null;
  });

  $: if (candlestickSeries) {
    if (bars.length === 0) {
      candlestickSeries.setData([]);
      lastDataSignature = getDataSignature(bars, timeframe);
    } else {
      const nextSignature = getDataSignature(bars, timeframe);
      const chartData = bars.map((bar) => ({
        time: Math.floor(bar.timestamp / 1000) as any,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      }));
      candlestickSeries.setData(chartData);
      if (nextSignature !== lastDataSignature) {
        chart?.timeScale().fitContent();
        lastDataSignature = nextSignature;
      }
    }
  }

  $: if (candlestickSeries && currentBar) {
    const chartBar = {
      time: Math.floor(currentBar.timestamp / 1000) as any,
      open: currentBar.open,
      high: currentBar.high,
      low: currentBar.low,
      close: currentBar.close
    };
    candlestickSeries.update(chartBar);
  }
</script>

<svelte:window
  on:keydown={handleDeleteKey}
  on:keydown={handleToolModifierKey}
  on:keyup={handleToolModifierKey}
/>

<div class="chart-wrapper">
  <div class="chart-meta">
    <div class="meta-left">
      <span class="symbol mono">{pair}</span>
      <span>{timeframe}</span>
      <span>{bars.length} bars</span>
      {#if activeTool !== 'cursor'}
        <span class="tool-pill">{activeTool}</span>
      {/if}
      {#if magnetEnabled}
        <span class="tool-pill magnet">MAG</span>
      {/if}
    </div>
    {#if currentBar}
      <div class="meta-right mono">{new Date(currentBar.timestamp).toLocaleString()}</div>
    {/if}
  </div>
  <div bind:this={chartContainer} class="chart-container"></div>
  <svg
    bind:this={chartOverlay}
    class="chart-overlay"
    class:interactive={overlayInteractive}
    viewBox={`0 0 ${Math.max(overlayWidth, 1)} ${Math.max(overlayHeight, 1)}`}
    on:pointerdown={handleOverlayPointerDown}
    on:pointermove={handleOverlayPointerMove}
    on:pointerup={handleOverlayPointerUp}
    on:pointerleave={handleOverlayPointerUp}
  >
    {#if drawingsVisible}
      {#each sortedDrawings as drawing (drawing.id)}
        {@const points = screenPointsForDrawing(drawing)}
        {#if points.length > 0}
          {#if drawing.tool === 'rectangle' && points.length >= 2}
            {@const left = Math.min(points[0].x, points[1].x)}
            {@const top = Math.min(points[0].y, points[1].y)}
            <rect
              x={left}
              y={top}
              width={Math.abs(points[1].x - points[0].x)}
              height={Math.abs(points[1].y - points[0].y)}
              style={styleForTool(drawing)}
            />
          {:else if drawing.tool === 'text' && points.length >= 1}
            <text
              x={points[0].x}
              y={points[0].y}
              fill={drawing.style.color}
              font-size={drawing.style.textSize ?? 12}
              font-weight="600"
              text-anchor="start"
            >
              {drawing.text || 'Note'}
            </text>
          {:else if drawing.tool === 'fibonacci' && points.length >= 2}
            {#each renderLevels(drawing, points) as level}
              <line
                x1="0"
                y1={level.y}
                x2={overlayWidth}
                y2={level.y}
                style={styleForTool(drawing)}
              />
              <text
                x="6"
                y={level.y - 4}
                fill={drawing.style.color}
                font-size={Math.max(10, (drawing.style.textSize ?? 11) - 1)}
              >
                {Math.round(level.ratio * 1000) / 1000}
              </text>
            {/each}
          {:else if drawing.tool === 'brush' && points.length >= 2}
            <polyline
              points={points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              style={styleForTool(drawing)}
            />
          {:else}
            {@const line = lineCoordinates(points, drawing.tool)}
            {#if line}
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                style={styleForTool(drawing)}
                marker-end={drawing.tool === 'arrow' ? 'url(#arrowhead)' : undefined}
              />
            {/if}
          {/if}

          {#if selectedDrawingId === drawing.id}
            {#each points as point}
              <circle cx={point.x} cy={point.y} r="4" style={selectedHandleStyle(drawing)} />
            {/each}
          {/if}
        {/if}
      {/each}
    {/if}

    {#if draftDrawing}
      {@const draftPointsScreen = screenPointsForDrawing(draftDrawing)}
      {#if draftDrawing.tool === 'rectangle' && draftPointsScreen.length >= 2}
        {@const left = Math.min(draftPointsScreen[0].x, draftPointsScreen[1].x)}
        {@const top = Math.min(draftPointsScreen[0].y, draftPointsScreen[1].y)}
        <rect
          x={left}
          y={top}
          width={Math.abs(draftPointsScreen[1].x - draftPointsScreen[0].x)}
          height={Math.abs(draftPointsScreen[1].y - draftPointsScreen[0].y)}
          style={styleForTool(draftDrawing)}
          opacity="0.5"
        />
      {:else if draftPointsScreen.length >= 2}
        {@const line = lineCoordinates(draftPointsScreen, draftDrawing.tool)}
        {#if line}
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            style={styleForTool(draftDrawing)}
            opacity="0.6"
          />
        {/if}
      {:else if draftPointsScreen.length === 1}
        <circle cx={draftPointsScreen[0].x} cy={draftPointsScreen[0].y} r="4" fill="#f8fafc" />
      {/if}
    {/if}

    {#if riskDraftSeed}
      {@const seedScreen = pointToScreen(riskDraftSeed)}
      {#if seedScreen}
        <circle cx={seedScreen.x} cy={seedScreen.y} r="5" class="risk-seed" />
      {/if}
    {/if}

    {#if riskDraft}
      {@const entryScreen = pointToScreen(riskDraft.entry)}
      {@const stopScreen = pointToScreen(riskDraft.stop)}
      {@const targetScreen = riskDraft.takeProfit ? pointToScreen(riskDraft.takeProfit) : null}
      {#if entryScreen && stopScreen}
        {@const stopZoneTop = Math.min(entryScreen.y, stopScreen.y)}
        {@const stopZoneHeight = Math.max(Math.abs(entryScreen.y - stopScreen.y), 1)}
        {@const chipWidth = Math.min(248, Math.max(164, overlayWidth - 16))}
        {@const chipMargin = 8}
        {@const preferLeft = entryScreen.x > overlayWidth * 0.62}
        {@const chipXRaw = preferLeft ? entryScreen.x - chipWidth - 12 : entryScreen.x + 12}
        {@const chipX = clamp(chipXRaw, chipMargin, overlayWidth - chipWidth - chipMargin)}
        {@const topBaseY = (targetScreen ? targetScreen.y : entryScreen.y) - 30}
        {@const topLabelY = clamp(topBaseY < chipMargin ? (targetScreen ? targetScreen.y + 8 : entryScreen.y + 8) : topBaseY, chipMargin, overlayHeight - 26)}
        {@const middleBaseY = entryScreen.y - 13}
        {@const middleLabelY = clamp(middleBaseY < chipMargin ? entryScreen.y + 10 : middleBaseY, chipMargin, overlayHeight - 28)}
        {@const bottomBaseY = stopScreen.y + 8}
        {@const bottomLabelY = clamp(bottomBaseY > overlayHeight - 26 ? stopScreen.y - 30 : bottomBaseY, chipMargin, overlayHeight - 26)}
        {#if targetScreen}
          {@const targetZoneTop = Math.min(entryScreen.y, targetScreen.y)}
          {@const targetZoneHeight = Math.max(Math.abs(entryScreen.y - targetScreen.y), 1)}
          <rect
            x="0"
            y={targetZoneTop}
            width={overlayWidth}
            height={targetZoneHeight}
            class="risk-target-zone"
          />
          <line x1="0" x2={overlayWidth} y1={targetScreen.y} y2={targetScreen.y} class="risk-target" />
          <circle cx="12" cy={targetScreen.y} r="4.5" class="risk-handle target" />
          <circle cx={overlayWidth - 12} cy={targetScreen.y} r="4.5" class="risk-handle target" />
        {/if}
        <rect
          x="0"
          y={stopZoneTop}
          width={overlayWidth}
          height={stopZoneHeight}
          class="risk-stop-zone"
        />
        <line x1="0" x2={overlayWidth} y1={entryScreen.y} y2={entryScreen.y} class="risk-entry" />
        <line x1="0" x2={overlayWidth} y1={stopScreen.y} y2={stopScreen.y} class="risk-stop" />
        <circle cx={overlayWidth / 2} cy={entryScreen.y} r="5" class="risk-handle entry" />
        <circle cx="12" cy={stopScreen.y} r="4.5" class="risk-handle stop" />
        <circle cx={overlayWidth - 12} cy={stopScreen.y} r="4.5" class="risk-handle stop" />

        <g class="risk-chip top" transform={`translate(${chipX}, ${topLabelY})`}>
          <rect width={chipWidth} height="22" rx="5" />
          <text x="8" y="15">{riskOverlayMetrics?.topLabel ?? 'Target: --'}</text>
        </g>

        <g class="risk-chip mid" transform={`translate(${chipX}, ${middleLabelY})`}>
          <rect width={chipWidth} height="24" rx="5" />
          <text x="8" y="16">{riskOverlayMetrics?.middleLabel ?? 'Open P&L: --, Qty: --, RR: --'}</text>
        </g>

        <g class="risk-chip stop" transform={`translate(${chipX}, ${bottomLabelY})`}>
          <rect width={chipWidth} height="22" rx="5" />
          <text x="8" y="15">{riskOverlayMetrics?.bottomLabel ?? 'Stop: --'}</text>
        </g>
      {/if}
    {/if}

    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
      </marker>
    </defs>

    {#each positions as position}
      {#if typeof position.stopLoss === 'number'}
        {@const stopY = candlestickSeries?.priceToCoordinate(position.stopLoss)}
        {#if typeof stopY === 'number'}
          <line
            class="position-level stop"
            x1="0"
            x2={overlayWidth}
            y1={stopY}
            y2={stopY}
          />
        {/if}
      {/if}
      {#if typeof position.takeProfit === 'number'}
        {@const takeY = candlestickSeries?.priceToCoordinate(position.takeProfit)}
        {#if typeof takeY === 'number'}
          <line
            class="position-level take"
            x1="0"
            x2={overlayWidth}
            y1={takeY}
            y2={takeY}
          />
        {/if}
      {/if}
    {/each}
  </svg>
</div>

<style>
  .chart-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #0e141d;
  }

  .chart-meta {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 4;
    pointer-events: none;
  }

  .meta-left,
  .meta-right {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #8da3be;
    font-size: 11px;
    background: rgba(11, 15, 20, 0.72);
    border: 1px solid rgba(51, 65, 85, 0.65);
    border-radius: 999px;
    padding: 4px 9px;
    backdrop-filter: blur(4px);
  }

  .symbol {
    color: #dbe9ff;
    font-weight: 600;
  }

  .tool-pill {
    font-size: 10px;
    text-transform: uppercase;
    color: #e5edff;
    border: 1px solid rgba(129, 151, 179, 0.6);
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(17, 31, 45, 0.65);
  }

  .tool-pill.magnet {
    color: #fcd34d;
    border-color: rgba(252, 211, 77, 0.65);
  }

  .chart-container {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .chart-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    height: 100%;
    pointer-events: none;
    cursor: default;
  }

  .chart-overlay.interactive {
    pointer-events: auto;
    cursor: crosshair;
  }

  .position-level {
    stroke-width: 1.5;
    stroke-dasharray: 5 5;
    opacity: 0.8;
  }

  .position-level.stop {
    stroke: #ef4444;
  }

  .position-level.take {
    stroke: #22c55e;
  }

  .risk-seed {
    fill: #f8fafc;
    stroke: #f59e0b;
    stroke-width: 2;
  }

  .risk-target-zone {
    fill: rgba(16, 185, 129, 0.22);
    stroke: none;
  }

  .risk-stop-zone {
    fill: rgba(239, 68, 68, 0.2);
    stroke: none;
  }

  .risk-target {
    stroke: rgba(45, 212, 191, 0.94);
    stroke-width: 1.4;
    stroke-dasharray: 6 4;
  }

  .risk-entry {
    stroke: #5aa8ff;
    stroke-width: 1.35;
    stroke-dasharray: 6 4;
  }

  .risk-stop {
    stroke: rgba(255, 107, 129, 0.96);
    stroke-width: 1.35;
    stroke-dasharray: 6 4;
  }

  .risk-handle {
    fill: #0d1521;
    stroke: #327cf5;
    stroke-width: 1.7;
  }

  .risk-handle.entry {
    stroke: #5aa8ff;
  }

  .risk-handle.stop {
    stroke: #ff5f75;
  }

  .risk-handle.target {
    stroke: #2cd1a7;
  }

  .risk-chip rect {
    fill: rgba(9, 20, 31, 0.82);
    stroke: rgba(122, 159, 198, 0.44);
    stroke-width: 1;
  }

  .risk-chip text {
    fill: #dbecff;
    font-size: 11px;
    font-weight: 600;
    font-family: 'IBM Plex Sans', 'Inter', sans-serif;
    letter-spacing: 0.12px;
  }

  .risk-chip.mid rect {
    fill: rgba(14, 35, 44, 0.82);
    stroke: rgba(92, 196, 167, 0.55);
  }

  .risk-chip.stop rect {
    fill: rgba(47, 22, 30, 0.82);
    stroke: rgba(238, 105, 126, 0.56);
  }
</style>
