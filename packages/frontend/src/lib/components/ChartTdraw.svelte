<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
  import { createDrawingEngine, type DrawingEngine } from '@tdraw-tools/core';
  import {
    attachLightweightCharts,
    type AttachedDrawingAdapter,
    type AttachOptions
  } from '@tdraw-tools/lightweight-adapter';
  import { registerRiskTool, riskPositionRenderer } from '@tdraw-tools/risk';
  import type {
    Bar,
    DrawingEngineSnapshotV1,
    DrawingEntity,
    DrawingPoint,
    DrawingToolType,
    Position,
    RiskOverlayMetrics,
    RiskToolDraft,
    Timeframe,
    TradingPair
  } from '$shared/types';
  import {
    legacyDrawingsToSnapshot,
    resolveEngineToolFromAppTool,
    snapshotToLegacyDrawings
  } from '$lib/engine/tdraw-bridge';
  import {
    normalizeChartSize,
    shouldApplyChartResize,
    type ChartSize
  } from '$lib/utils/chart-resize';

  export let bars: Bar[] = [];
  export let currentBar: Bar | null = null;
  export let timeframe: Timeframe = 'M1';
  export let pair: TradingPair = 'NAS100';
  export let sessionId = '';
  export let drawings: DrawingEntity[] = [];
  export let drawingSnapshot: DrawingEngineSnapshotV1 | null = null;
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
  export let onSnapshotChange:
    | ((snapshot: DrawingEngineSnapshotV1) => void)
    | undefined = undefined;
  export let onRiskDraftPoint: ((point: DrawingPoint) => void) | undefined = undefined;
  export let onRiskDraftAdjust: ((patch: Partial<RiskToolDraft>) => void) | undefined = undefined;
  export let onPositionLevelDrag:
    | ((payload: { positionId: string; level: 'stopLoss' | 'takeProfit'; price: number }) => void)
    | undefined = undefined;

  let chartContainer: HTMLDivElement;
  let chartOverlay: SVGSVGElement;
  let chart: IChartApi | null = null;
  let candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  let drawingEngine: DrawingEngine | null = null;
  let drawingAdapter: AttachedDrawingAdapter | null = null;
  let engineUnsubscribe: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrameId: number | null = null;
  let pendingSize: ChartSize | null = null;
  let lastAppliedSize: ChartSize | null = null;
  let lastDataSignature: string | null = null;
  let overlayWidth = 0;
  let overlayHeight = 0;

  let dragContext:
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
  let riskDraftUpdateFrameId: number | null = null;
  let pendingRiskPatch: Partial<RiskToolDraft> | null = null;

  let isApplyingExternalState = false;
  let lastImportedToken = '';
  let lastEngineToken = '';
  let lastSeedToken = '';
  let emittedDrawings = new Map<string, DrawingEntity>();

  $: overlayInteractive = activeTool === 'risk_position' || riskDraft !== null || dragContext !== null;
  $: drawingInputEnabled = drawingsVisible && !overlayInteractive;

  $: if (drawingAdapter) {
    drawingAdapter.canvas.style.pointerEvents = drawingInputEnabled ? 'auto' : 'none';
    drawingAdapter.canvas.style.cursor = activeTool === 'cursor' ? 'default' : 'crosshair';
  }

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
      drawingAdapter?.requestRender();
    });
  }

  function getDataSignature(localBars: Bar[], currentTimeframe: Timeframe): string {
    if (localBars.length === 0) return `empty:${currentTimeframe}`;
    const firstTimestamp = localBars[0].timestamp;
    const lastTimestamp = localBars[localBars.length - 1].timestamp;
    return `${currentTimeframe}:${localBars.length}:${firstTimestamp}:${lastTimestamp}`;
  }

  function pointerInChart(event: PointerEvent): { x: number; y: number } {
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

    const priceValue = candlestickSeries.coordinateToPrice(pointer.y);
    const fallbackPrice = currentBar?.close ?? bars[bars.length - 1]?.close ?? 0;
    const price = typeof priceValue === 'number' ? priceValue : fallbackPrice;

    return {
      timestamp,
      price
    };
  }

  function pointToScreen(point: DrawingPoint): { x: number; y: number } | null {
    if (!chart || !candlestickSeries) return null;
    const timeCoord = chart.timeScale().timeToCoordinate(Math.floor(point.timestamp / 1000) as any);
    const priceCoord = candlestickSeries.priceToCoordinate(point.price);
    if (timeCoord === null || priceCoord === null) return null;
    return { x: timeCoord, y: priceCoord };
  }

  function serializeDrawing(drawing: DrawingEntity): string {
    const points = drawing.points
      .map((point) => `${Math.round(point.timestamp)}:${point.price.toFixed(8)}`)
      .join(';');
    return [
      drawing.id,
      drawing.tool,
      points,
      drawing.style.color,
      drawing.style.lineWidth,
      drawing.style.lineStyle,
      drawing.style.fillColor ?? '',
      drawing.style.fillOpacity ?? '',
      drawing.style.textSize ?? '',
      drawing.text ?? '',
      drawing.locked ? '1' : '0',
      drawing.hidden ? '1' : '0',
      drawing.zIndex ?? 0,
      drawing.createdAt,
      drawing.updatedAt
    ].join('|');
  }

  function drawingsToken(input: DrawingEntity[], visible: boolean): string {
    return `${visible ? '1' : '0'}:${input.map(serializeDrawing).join('||')}`;
  }

  function snapshotToken(snapshot: DrawingEngineSnapshotV1): string {
    return JSON.stringify({
      version: snapshot.version,
      prefs: snapshot.prefs,
      drawings: snapshot.drawings.map((drawing) => ({
        id: drawing.id,
        tool: drawing.tool,
        points: drawing.points,
        visible: drawing.visible,
        locked: drawing.locked,
        zIndex: drawing.zIndex,
        updatedAt: drawing.updatedAt
      }))
    });
  }

  function applyEngineSnapshot(snapshot: DrawingEngineSnapshotV1): void {
    if (!drawingEngine) return;

    isApplyingExternalState = true;
    try {
      drawingEngine.importSnapshot(snapshot as Parameters<DrawingEngine['importSnapshot']>[0]);
      const syncedLegacy = snapshotToLegacyDrawings(snapshot, {
        sessionId,
        pair,
        bars
      });
      emittedDrawings = new Map(syncedLegacy.map((drawing) => [drawing.id, drawing]));
      lastImportedToken = drawingsToken(syncedLegacy, drawingsVisible);
      lastEngineToken = drawingsToken(syncedLegacy, drawingsVisible);
      onSelectDrawing?.(drawingEngine.getState().selection.primaryId);
      drawingAdapter?.requestRender();
    } catch (error) {
      console.error('[chart-tdraw] failed to import snapshot', error);
    } finally {
      isApplyingExternalState = false;
    }
  }

  function syncEngineFromProps(force = false): void {
    if (!drawingEngine) return;

    const normalized = drawings.map((drawing) => ({
      ...drawing,
      hidden: drawingsVisible ? (drawing.hidden ?? false) : true
    }));
    const nextToken = drawingsToken(normalized, drawingsVisible);
    if (!force) {
      if (nextToken === lastImportedToken) return;
      if (nextToken === lastEngineToken) {
        lastImportedToken = nextToken;
        return;
      }
    }

    const snapshot = legacyDrawingsToSnapshot(normalized, {
      bars,
      activeTool: resolveEngineToolFromAppTool(activeTool),
      snapMode: magnetEnabled ? 'weak' : 'off',
      meta: {
        sessionId,
        pair
      }
    });

    applyEngineSnapshot(snapshot);
    lastImportedToken = nextToken;
  }

  function emitDrawingDiff(nextDrawings: DrawingEntity[]): void {
    const nextById = new Map(nextDrawings.map((drawing) => [drawing.id, drawing]));

    for (const [id, drawing] of nextById) {
      const previous = emittedDrawings.get(id);
      if (!previous) {
        onCreateDrawing?.(drawing);
        continue;
      }
      if (serializeDrawing(previous) !== serializeDrawing(drawing)) {
        onUpdateDrawing?.(drawing);
      }
    }

    for (const id of emittedDrawings.keys()) {
      if (!nextById.has(id)) {
        onDeleteDrawing?.(id);
      }
    }

    emittedDrawings = nextById;
  }

  function handleEngineStateChange(): void {
    if (!drawingEngine || isApplyingExternalState) return;

    const snapshot = drawingEngine.exportSnapshot() as DrawingEngineSnapshotV1;
    const nextDrawings = snapshotToLegacyDrawings(snapshot, {
      sessionId,
      pair,
      bars
    });

    lastEngineToken = drawingsToken(nextDrawings, drawingsVisible);
    emitDrawingDiff(nextDrawings);
    onSelectDrawing?.(drawingEngine.getState().selection.primaryId);
    onSnapshotChange?.(snapshot);
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

  function handleOverlayPointerDown(event: PointerEvent) {
    if (!overlayInteractive) return;
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

    const levelHit = pickPositionLevelHit(event);
    if (levelHit) {
      dragContext = {
        mode: 'position-level',
        positionId: levelHit.positionId,
        level: levelHit.level
      };
    }
  }

  function handleOverlayPointerMove(event: PointerEvent) {
    if (!overlayInteractive && !dragContext) return;
    const anchor = pointerToAnchor(event);
    if (!anchor) return;

    if (dragContext) {
      if (dragContext.mode === 'position-level') {
        handlePositionLevelDrag(anchor);
      } else {
        handleRiskDraftDrag(anchor);
      }
    }
  }

  function handleOverlayPointerUp() {
    flushRiskDraftAdjust();
    dragContext = null;
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

    drawingEngine = createDrawingEngine({
      initialTool: resolveEngineToolFromAppTool(activeTool),
      snapMode: magnetEnabled ? 'weak' : 'off',
      emitOnAnimationFrame: true
    });
    registerRiskTool(drawingEngine);

    drawingAdapter = attachLightweightCharts(drawingEngine, {
      chart: chart as unknown as AttachOptions['chart'],
      series: candlestickSeries as unknown as AttachOptions['series'],
      container: chartContainer,
      customRenderers: {
        risk_position: riskPositionRenderer
      }
    });

    engineUnsubscribe = drawingEngine.subscribe((event) => {
      if (event.reason === 'metrics') return;
      handleEngineStateChange();
    });

    const seed = drawingSnapshot;
    if (seed) {
      lastSeedToken = snapshotToken(seed);
      applyEngineSnapshot(seed);
    } else {
      syncEngineFromProps(true);
    }

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const width = entry?.contentRect.width ?? chartContainer.clientWidth;
      const height = entry?.contentRect.height ?? chartContainer.clientHeight;
      queueResize(width, height);
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
    if (riskDraftUpdateFrameId !== null) {
      cancelAnimationFrame(riskDraftUpdateFrameId);
      riskDraftUpdateFrameId = null;
    }
    pendingRiskPatch = null;

    engineUnsubscribe?.();
    engineUnsubscribe = null;

    drawingAdapter?.detach();
    drawingAdapter = null;

    resizeObserver?.disconnect();
    resizeObserver = null;

    if (chart) {
      chart.remove();
    }
    chart = null;
    candlestickSeries = null;
    drawingEngine = null;
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
        drawingAdapter?.requestRender();
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
    drawingAdapter?.requestRender();
  }

  $: if (drawingEngine) {
    const nextTool = resolveEngineToolFromAppTool(activeTool);
    if (drawingEngine.getState().activeTool !== nextTool) {
      drawingEngine.setTool(nextTool);
    }
    drawingEngine.setOptions({
      snapMode: magnetEnabled ? 'weak' : 'off'
    });
  }

  $: if (drawingEngine && drawingSnapshot) {
    const token = snapshotToken(drawingSnapshot);
    if (token !== lastSeedToken) {
      lastSeedToken = token;
      applyEngineSnapshot(drawingSnapshot);
    }
  }

  $: if (drawingEngine && selectedDrawingId === null) {
    if (drawingEngine.getState().selection.primaryId !== null) {
      drawingEngine.clearSelection();
    }
  }

  $: if (drawingEngine) {
    syncEngineFromProps();
  }
</script>

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
    z-index: 40;
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
    z-index: 30;
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
