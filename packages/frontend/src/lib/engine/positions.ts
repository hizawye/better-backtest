import type { Position } from '$shared/types';
import { updatePositionPnL } from './pnl';

export class PositionManager {
  private positions: Map<string, Position> = new Map();

  add(position: Position): void {
    this.positions.set(position.id, position);
  }

  remove(positionId: string): boolean {
    return this.positions.delete(positionId);
  }

  get(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  update(positionId: string, updates: Partial<Position>): Position | null {
    const current = this.positions.get(positionId);
    if (!current) return null;
    const next = { ...current, ...updates };
    this.positions.set(positionId, next);
    return next;
  }

  getAll(): Position[] {
    return Array.from(this.positions.values());
  }

  replaceAll(positions: Position[]): void {
    this.positions.clear();
    positions.forEach((position) => {
      this.positions.set(position.id, position);
    });
  }

  updatePrices(currentBid: number, currentAsk: number): void {
    this.positions.forEach((position, id) => {
      const updated = updatePositionPnL(position, currentBid, currentAsk);
      this.positions.set(id, updated);
    });
  }

  getTotalUnrealizedPnL(): number {
    return this.getAll().reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);
  }

  clear(): void {
    this.positions.clear();
  }
}

export const positionManager = new PositionManager();
