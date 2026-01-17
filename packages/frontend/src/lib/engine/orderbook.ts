import type { Order } from '../../../../shared/types';

export class OrderBook {
  private orders: Map<string, Order> = new Map();

  add(order: Order): void {
    this.orders.set(order.id, order);
  }

  remove(orderId: string): boolean {
    return this.orders.delete(orderId);
  }

  get(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getAll(): Order[] {
    return Array.from(this.orders.values());
  }

  getPending(): Order[] {
    return this.getAll().filter(o => o.status === 'pending');
  }

  updateStatus(orderId: string, status: Order['status']): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
    }
  }

  fill(orderId: string, filledPrice: number, timestamp: number): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'filled';
      order.filledPrice = filledPrice;
      order.filledAt = timestamp;
    }
  }

  clear(): void {
    this.orders.clear();
  }
}

export const orderBook = new OrderBook();
