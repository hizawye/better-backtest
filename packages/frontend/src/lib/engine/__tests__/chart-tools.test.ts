import { describe, expect, test } from 'bun:test';
import type { DrawingEntity } from '$shared/types';
import { createDrawingEntity, getLineDash, hitTestDrawing, snapTimestampToBars } from '../chart-tools';

describe('chart tools geometry', () => {
  test('snaps timestamp to nearest bar anchor', () => {
    const bars = [
      { timestamp: 1_000, open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 2_000, open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 3_000, open: 1, high: 1, low: 1, close: 1 }
    ];

    expect(snapTimestampToBars(2_450, bars)).toBe(2_000);
    expect(snapTimestampToBars(2_700, bars)).toBe(3_000);
  });

  test('hit test detects handles before shape', () => {
    const drawing = createDrawingEntity({
      id: 'd1',
      sessionId: 's1',
      pair: 'NAS100',
      tool: 'trend_line',
      points: [
        { timestamp: 1000, price: 100 },
        { timestamp: 2000, price: 110 }
      ]
    });

    const project = (point: { timestamp: number; price: number }) => ({
      x: point.timestamp / 10,
      y: point.price
    });

    const handleHit = hitTestDrawing(drawing, { x: 100, y: 100 }, project, 6);
    expect(handleHit.hit).toBeTrue();
    expect(handleHit.part).toBe('handle');

    const shapeHit = hitTestDrawing(drawing, { x: 150, y: 105 }, project, 6);
    expect(shapeHit.hit).toBeTrue();
    expect(shapeHit.part).toBe('shape');
  });

  test('drawing entity supports stable serialization roundtrip', () => {
    const source = createDrawingEntity({
      id: 'd2',
      sessionId: 's1',
      pair: 'NAS100',
      tool: 'rectangle',
      points: [
        { timestamp: 1_000, price: 90 },
        { timestamp: 2_000, price: 110 }
      ]
    });

    const serialized = JSON.stringify(source);
    const restored = JSON.parse(serialized) as DrawingEntity;

    expect(restored.id).toBe(source.id);
    expect(restored.tool).toBe('rectangle');
    expect(restored.points.length).toBe(2);
    expect(restored.style.color).toBe(source.style.color);
  });

  test('ray hit testing only extends forward from first point', () => {
    const drawing = createDrawingEntity({
      id: 'd3',
      sessionId: 's1',
      pair: 'NAS100',
      tool: 'ray',
      points: [
        { timestamp: 1_000, price: 100 },
        { timestamp: 2_000, price: 100 }
      ]
    });
    const project = (point: { timestamp: number; price: number }) => ({
      x: point.timestamp / 10,
      y: point.price
    });

    const backwardMiss = hitTestDrawing(drawing, { x: 80, y: 100 }, project, 4);
    const forwardHit = hitTestDrawing(drawing, { x: 260, y: 100 }, project, 4);
    expect(backwardMiss.hit).toBeFalse();
    expect(forwardHit.hit).toBeTrue();
  });

  test('line style presets map into chart dash arrays', () => {
    expect(getLineDash({ color: '#fff', lineWidth: 2, lineStyle: 'solid' })).toBeNull();
    expect(getLineDash({ color: '#fff', lineWidth: 2, lineStyle: 'dashed' })).toBe('7 5');
    expect(getLineDash({ color: '#fff', lineWidth: 2, lineStyle: 'dotted' })).toBe('2 5');
  });
});
