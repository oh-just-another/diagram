/** Insertion-ordered LRU map: get() marks recency; set() evicts oldest past `cap` (by entry count). */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  constructor(
    private readonly cap: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {}
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  has(key: K): boolean {
    return this.map.has(key);
  }
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value as K;
      const ev = this.map.get(oldest);
      this.map.delete(oldest);
      if (ev !== undefined) this.onEvict?.(oldest, ev);
    }
  }
  delete(key: K): boolean {
    return this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
  keys(): IterableIterator<K> {
    return this.map.keys();
  }
  values(): IterableIterator<V> {
    return this.map.values();
  }
}
