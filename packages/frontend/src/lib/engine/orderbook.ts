import type { Order } from '$shared/types';

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

  replaceAll(orders: Order[]): void {
    this.orders.clear();
    orders.forEach((order) => {
      this.orders.set(order.id, order);
    });
  }

  updateStatus(orderId: string, status: Order['status']): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
    }
  }

  amend(orderId: string, updates: Partial<Order>, timestamp: number): Order | null {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') return null;

    const amended: Order = {
      ...order,
      ...updates,
      amendedAt: timestamp
    };
    this.orders.set(orderId, amended);
    return amended;
  }

  fill(orderId: string, filledPrice: number, timestamp: number): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'filled';
      order.filledPrice = filledPrice;
      order.filledAt = timestamp;
    }
  }

  cancel(orderId: string, reason: string, timestamp: number): Order | null {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') return null;

    const cancelled: Order = {
      ...order,
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: timestamp
    };
    this.orders.set(orderId, cancelled);
    return cancelled;
  }

  clear(): void {
    this.orders.clear();
  }
}

export const orderBook = new OrderBook();
