import { createDefaultDrawingStyle } from '$lib/engine/chart-tools';
import type {
  Bar,
  DrawingEngineEntity,
  DrawingEngineLineStyle,
  DrawingEngineSnapMode,
  DrawingEngineSnapshotV1,
  DrawingEngineStyle,
  DrawingEntity,
  DrawingStyle,
  DrawingToolType,
  TradingPair
} from '$shared/types';

type LegacyDrawingTool = Exclude<DrawingToolType, 'cursor' | 'risk_position'>;
type LegacyEngineEntity = Omit<DrawingEngineEntity, 'tool'> & { tool: LegacyDrawingTool };

const LEGACY_DRAWING_TOOLS: LegacyDrawingTool[] = [
  'trend_line',
  'horizontal_line',
  'vertical_line',
  'ray',
  'extended_line',
  'rectangle',
  'text',
  'arrow',
  'ruler',
  'fibonacci',
  'brush'
];

const LEGACY_DRAWING_TOOL_SET = new Set<string>(LEGACY_DRAWING_TOOLS);

interface SnapshotBuildOptions {
  bars: Bar[];
  activeTool?: string;
  snapMode?: DrawingEngineSnapMode;
  meta?: Record<string, unknown>;
}

interface SnapshotHydrateOptions {
  sessionId: string;
  pair: TradingPair;
  bars: Bar[];
}

function isLegacyDrawingTool(tool: string): tool is LegacyDrawingTool {
  return LEGACY_DRAWING_TOOL_SET.has(tool);
}

function isLegacyEngineEntity(drawing: DrawingEngineEntity): drawing is LegacyEngineEntity {
  return isLegacyDrawingTool(drawing.tool);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inferIntervalMs(bars: Bar[]): number {
  if (bars.length < 2) return 60_000;
  const upperBound = Math.min(bars.length - 1, 300);
  const gaps: number[] = [];
  for (let index = 1; index <= upperBound; index += 1) {
    const gap = bars[index].timestamp - bars[index - 1].timestamp;
    if (gap > 0) {
      gaps.push(gap);
    }
  }
  if (gaps.length === 0) return 60_000;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 60_000;
}

function nearestBarIndex(timestamp: number, bars: Bar[]): number {
  if (bars.length === 0) return 0;

  let low = 0;
  let high = bars.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = bars[mid].timestamp;
    if (value === timestamp) return mid;
    if (value < timestamp) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (high < 0) return 0;
  if (low >= bars.length) return bars.length - 1;

  const lower = bars[high];
  const upper = bars[low];
  return Math.abs(timestamp - lower.timestamp) <= Math.abs(upper.timestamp - timestamp) ? high : low;
}

export function timestampToLogical(timestamp: number, bars: Bar[]): number {
  if (bars.length === 0) {
    return Math.floor(timestamp / 1000);
  }
  return nearestBarIndex(timestamp, bars);
}

export function logicalToTimestamp(logical: number, bars: Bar[]): number {
  const normalizedLogical = Number.isFinite(logical) ? Math.round(logical) : 0;
  if (bars.length === 0) {
    return normalizedLogical * 1000;
  }

  if (normalizedLogical >= 0 && normalizedLogical < bars.length) {
    return bars[normalizedLogical].timestamp;
  }

  const interval = inferIntervalMs(bars);
  if (normalizedLogical < 0) {
    return bars[0].timestamp + normalizedLogical * interval;
  }

  return bars[bars.length - 1].timestamp + (normalizedLogical - (bars.length - 1)) * interval;
}

function parseHexColor(rawColor: string): { r: number; g: number; b: number; a: number } | null {
  if (!rawColor.startsWith('#')) return null;
  const hex = rawColor.slice(1).trim();
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return { r, g, b, a: 1 };
  }
  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  if (hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = Number.parseInt(hex.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }
  return null;
}

function parseRgbColor(rawColor: string): { r: number; g: number; b: number; a: number } | null {
  const color = rawColor.trim().toLowerCase();
  const rgbaMatch = color.match(/^rgba\(([^)]+)\)$/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    if (parts.length !== 4) return null;
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = Number(parts[3]);
    if ([r, g, b, a].every((value) => Number.isFinite(value))) {
      return { r, g, b, a: clamp(a, 0, 1) };
    }
    return null;
  }

  const rgbMatch = color.match(/^rgb\(([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length !== 3) return null;
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    if ([r, g, b].every((value) => Number.isFinite(value))) {
      return { r, g, b, a: 1 };
    }
  }

  return null;
}

function parseColor(rawColor: string): { r: number; g: number; b: number; a: number } | null {
  return parseHexColor(rawColor) ?? parseRgbColor(rawColor);
}

function withOpacity(color: string, opacity: number): string {
  const alpha = clamp(opacity, 0, 1);
  const parsed = parseColor(color);
  if (!parsed) {
    return color;
  }
  return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${alpha})`;
}

function alphaFromColor(color: string): number | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  return clamp(parsed.a, 0, 1);
}

function normalizeLineStyle(lineStyle: string): DrawingEngineLineStyle {
  if (lineStyle === 'dashed' || lineStyle === 'dotted') {
    return lineStyle;
  }
  return 'solid';
}

function toEngineStyle(
  tool: LegacyDrawingTool,
  style: DrawingStyle
): DrawingEngineStyle {
  const fillBaseColor = style.fillColor ?? style.color;
  const fillAlpha = style.fillOpacity ?? (tool === 'rectangle' ? 0.12 : 0);

  return {
    strokeColor: style.color,
    fillColor: withOpacity(fillBaseColor, fillAlpha),
    textColor: style.color,
    lineWidth: Math.max(1, style.lineWidth || 1),
    lineStyle: normalizeLineStyle(style.lineStyle),
    opacity: 1,
    showLabel: true
  };
}

function toLegacyStyle(
  tool: LegacyDrawingTool,
  style: DrawingEngineStyle
): DrawingStyle {
  const defaults = createDefaultDrawingStyle(tool);
  const parsedFillOpacity = alphaFromColor(style.fillColor);

  return {
    ...defaults,
    color: style.strokeColor || defaults.color,
    lineWidth: Number.isFinite(style.lineWidth) ? Math.max(1, style.lineWidth) : defaults.lineWidth,
    lineStyle: normalizeLineStyle(style.lineStyle || defaults.lineStyle),
    fillColor: style.fillColor || defaults.fillColor,
    fillOpacity: parsedFillOpacity ?? defaults.fillOpacity,
    textSize: defaults.textSize
  };
}

export function legacyDrawingsToSnapshot(
  drawings: DrawingEntity[],
  options: SnapshotBuildOptions
): DrawingEngineSnapshotV1 {
  const engineDrawings: DrawingEngineEntity[] = drawings
    .filter((drawing) => isLegacyDrawingTool(drawing.tool))
    .map((drawing, index) => ({
      id: drawing.id,
      tool: drawing.tool,
      points: drawing.points.map((point) => ({
        logical: timestampToLogical(point.timestamp, options.bars),
        price: point.price
      })),
      style: toEngineStyle(drawing.tool, drawing.style),
      text: drawing.text,
      visible: !(drawing.hidden ?? false),
      locked: Boolean(drawing.locked),
      zIndex: drawing.zIndex ?? index,
      createdAt: drawing.createdAt,
      updatedAt: drawing.updatedAt,
      metadata: {
        source: 'better-backtest-legacy'
      }
    }))
    .sort((a, b) => a.zIndex - b.zIndex || a.updatedAt - b.updatedAt);

  return {
    version: '1',
    drawings: engineDrawings,
    groups: [],
    prefs: {
      activeTool: options.activeTool ?? 'cursor',
      snapMode: options.snapMode ?? 'weak'
    },
    meta: {
      source: 'better-backtest',
      barCount: options.bars.length,
      ...options.meta
    }
  };
}

export function snapshotToLegacyDrawings(
  snapshot: DrawingEngineSnapshotV1,
  options: SnapshotHydrateOptions
): DrawingEntity[] {
  return snapshot.drawings
    .filter(isLegacyEngineEntity)
    .map((drawing) => ({
      id: drawing.id,
      sessionId: options.sessionId,
      pair: options.pair,
      tool: drawing.tool,
      points: drawing.points.map((point) => ({
        timestamp: logicalToTimestamp(point.logical, options.bars),
        price: point.price
      })),
      style: toLegacyStyle(drawing.tool, drawing.style),
      text: drawing.text,
      locked: drawing.locked,
      hidden: !drawing.visible,
      zIndex: drawing.zIndex,
      createdAt: drawing.createdAt,
      updatedAt: drawing.updatedAt
    }))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.updatedAt - b.updatedAt);
}

export function resolveEngineToolFromAppTool(tool: DrawingToolType): string {
  return tool === 'risk_position' ? 'cursor' : tool;
}
