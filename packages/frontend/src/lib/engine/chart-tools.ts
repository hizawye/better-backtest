import type { Bar, DrawingEntity, DrawingPoint, DrawingStyle, DrawingToolType } from '$shared/types';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface HitTestResult {
  hit: boolean;
  distance: number;
  pointIndex: number | null;
  part: 'handle' | 'shape' | null;
}

const DEFAULT_TOOL_STYLE: Record<Exclude<DrawingToolType, 'cursor' | 'risk_position'>, DrawingStyle> = {
  trend_line: { color: '#f59e0b', lineWidth: 2, lineStyle: 'solid' },
  horizontal_line: { color: '#60a5fa', lineWidth: 2, lineStyle: 'solid' },
  vertical_line: { color: '#60a5fa', lineWidth: 2, lineStyle: 'solid' },
  ray: { color: '#f97316', lineWidth: 2, lineStyle: 'solid' },
  extended_line: { color: '#38bdf8', lineWidth: 2, lineStyle: 'solid' },
  rectangle: { color: '#22c55e', lineWidth: 2, lineStyle: 'solid', fillColor: '#22c55e', fillOpacity: 0.12 },
  text: { color: '#f8fafc', lineWidth: 1, lineStyle: 'solid', textSize: 12 },
  arrow: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid' },
  ruler: { color: '#a78bfa', lineWidth: 1, lineStyle: 'dashed' },
  fibonacci: { color: '#34d399', lineWidth: 1, lineStyle: 'solid' },
  brush: { color: '#fbbf24', lineWidth: 2, lineStyle: 'solid' }
};

const REQUIRED_POINTS: Record<Exclude<DrawingToolType, 'cursor' | 'risk_position'>, number> = {
  trend_line: 2,
  horizontal_line: 1,
  vertical_line: 1,
  ray: 2,
  extended_line: 2,
  rectangle: 2,
  text: 1,
  arrow: 2,
  ruler: 2,
  fibonacci: 2,
  brush: 2
};

export function isDrawingTool(tool: DrawingToolType): tool is Exclude<DrawingToolType, 'cursor' | 'risk_position'> {
  return tool !== 'cursor' && tool !== 'risk_position';
}

export function requiredPointCount(tool: Exclude<DrawingToolType, 'cursor' | 'risk_position'>): number {
  return REQUIRED_POINTS[tool];
}

export function createDefaultDrawingStyle(tool: Exclude<DrawingToolType, 'cursor' | 'risk_position'>): DrawingStyle {
  return { ...DEFAULT_TOOL_STYLE[tool] };
}

export function createDrawingEntity(input: {
  id: string;
  sessionId: string;
  pair: string;
  tool: Exclude<DrawingToolType, 'cursor' | 'risk_position'>;
  points: DrawingPoint[];
  style?: DrawingStyle;
  text?: string;
}): DrawingEntity {
  const now = Date.now();
  return {
    id: input.id,
    sessionId: input.sessionId,
    pair: input.pair as DrawingEntity['pair'],
    tool: input.tool,
    points: input.points,
    style: input.style ?? createDefaultDrawingStyle(input.tool),
    text: input.text,
    hidden: false,
    locked: false,
    zIndex: now,
    createdAt: now,
    updatedAt: now
  };
}

export function getLineDash(style: DrawingStyle): string | null {
  if (style.lineStyle === 'dashed') return '7 5';
  if (style.lineStyle === 'dotted') return '2 5';
  return null;
}

export function snapTimestampToBars(timestamp: number, bars: Bar[]): number {
  if (bars.length === 0) return timestamp;
  let best = bars[0].timestamp;
  let bestDistance = Math.abs(timestamp - best);
  for (let index = 1; index < bars.length; index += 1) {
    const distance = Math.abs(timestamp - bars[index].timestamp);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = bars[index].timestamp;
    }
  }
  return best;
}

function distanceToSegment(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (lengthSquared <= 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const projection =
    ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) /
    lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  const projectedX = a.x + t * (b.x - a.x);
  const projectedY = a.y + t * (b.y - a.y);
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function distanceToRay(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx ** 2 + dy ** 2;
  if (lengthSquared <= 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const projection = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, projection);
  const projectedX = a.x + t * dx;
  const projectedY = a.y + t * dy;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

export function hitTestDrawing(
  drawing: DrawingEntity,
  target: ScreenPoint,
  projectPoint: (point: DrawingPoint) => ScreenPoint | null,
  threshold = 8
): HitTestResult {
  const projected = drawing.points.map(projectPoint).filter((point): point is ScreenPoint => point !== null);
  if (projected.length === 0) {
    return { hit: false, distance: Number.POSITIVE_INFINITY, pointIndex: null, part: null };
  }

  let nearestHandleDistance = Number.POSITIVE_INFINITY;
  let nearestHandleIndex: number | null = null;
  projected.forEach((point, index) => {
    const distance = Math.hypot(target.x - point.x, target.y - point.y);
    if (distance < nearestHandleDistance) {
      nearestHandleDistance = distance;
      nearestHandleIndex = index;
    }
  });

  if (nearestHandleDistance <= threshold) {
    return {
      hit: true,
      distance: nearestHandleDistance,
      pointIndex: nearestHandleIndex,
      part: 'handle'
    };
  }

  const first = projected[0];
  const second = projected[1] ?? projected[0];
  let shapeDistance = Number.POSITIVE_INFINITY;

  if (drawing.tool === 'horizontal_line') {
    shapeDistance = Math.abs(target.y - first.y);
  } else if (drawing.tool === 'vertical_line') {
    shapeDistance = Math.abs(target.x - first.x);
  } else if (drawing.tool === 'ray') {
    shapeDistance = distanceToRay(target, first, second);
  } else if (drawing.tool === 'rectangle') {
    const minX = Math.min(first.x, second.x);
    const maxX = Math.max(first.x, second.x);
    const minY = Math.min(first.y, second.y);
    const maxY = Math.max(first.y, second.y);
    if (target.x >= minX && target.x <= maxX && target.y >= minY && target.y <= maxY) {
      shapeDistance = 0;
    } else {
      const top = distanceToSegment(target, { x: minX, y: minY }, { x: maxX, y: minY });
      const right = distanceToSegment(target, { x: maxX, y: minY }, { x: maxX, y: maxY });
      const bottom = distanceToSegment(target, { x: maxX, y: maxY }, { x: minX, y: maxY });
      const left = distanceToSegment(target, { x: minX, y: maxY }, { x: minX, y: minY });
      shapeDistance = Math.min(top, right, bottom, left);
    }
  } else if (drawing.tool === 'brush') {
    shapeDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < projected.length; index += 1) {
      const distance = distanceToSegment(target, projected[index - 1], projected[index]);
      shapeDistance = Math.min(shapeDistance, distance);
    }
  } else {
    shapeDistance = distanceToSegment(target, first, second);
  }

  return {
    hit: shapeDistance <= threshold,
    distance: shapeDistance,
    pointIndex: null,
    part: shapeDistance <= threshold ? 'shape' : null
  };
}
