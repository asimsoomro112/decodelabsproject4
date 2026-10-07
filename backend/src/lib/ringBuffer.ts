/** Fixed-capacity ring buffer. Oldest entries are evicted first. */
export class RingBuffer<T> {
  private readonly buf: T[] = [];

  constructor(private readonly capacity: number = 100) {}

  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.capacity) {
      this.buf.shift();
    }
  }

  /** Entries oldest → newest. */
  toArray(): T[] {
    return [...this.buf];
  }

  get size(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf.length = 0;
  }
}
