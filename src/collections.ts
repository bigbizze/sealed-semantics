import { stableWireKey } from './keying.js';
import type { AnyKind, ValueOf } from './types.js';
export class ValueMap<Kd extends AnyKind, V> implements Iterable<[ValueOf<Kd>, V]> {
  #kind: Kd;
  #semantic: boolean;
  #entries = new Map<unknown, [ValueOf<Kd>, V]>();
  constructor(kind: Kd) { this.#kind = kind; this.#semantic = 'wire' in kind && 'parse' in kind; }
  #key(value: ValueOf<Kd>): unknown {
    if (!this.#kind.is(value)) throw new TypeError(`${this.#kind.kind} sealed key expected`);
    return this.#semantic ? stableWireKey((value as unknown as { encode(): unknown }).encode()) : value;
  }
  get size(): number { return this.#entries.size; }
  set(key: ValueOf<Kd>, value: V): this {
    const internal = this.#key(key), existing = this.#entries.get(internal);
    this.#entries.set(internal, [existing ? existing[0] : key, value]);
    return this;
  }
  get(key: ValueOf<Kd>): V | undefined { return this.#entries.get(this.#key(key))?.[1]; }
  has(key: ValueOf<Kd>): boolean { return this.#entries.has(this.#key(key)); }
  delete(key: ValueOf<Kd>): boolean { return this.#entries.delete(this.#key(key)); }
  clear(): void { this.#entries.clear(); }
  *entries(): IterableIterator<[ValueOf<Kd>, V]> { for (const [key, value] of this.#entries.values()) yield [key, value]; }
  *keys(): IterableIterator<ValueOf<Kd>> { for (const [key] of this.#entries.values()) yield key; }
  *values(): IterableIterator<V> { for (const [, value] of this.#entries.values()) yield value; }
  [Symbol.iterator](): IterableIterator<[ValueOf<Kd>, V]> { return this.entries(); }
  forEach(callback: (value: V, key: ValueOf<Kd>, map: this) => void, thisArg?: unknown): void {
    for (const [key, value] of this) callback.call(thisArg, value, key, this);
  }
  get [Symbol.toStringTag](): string { return 'ValueMap'; }
}
export class ValueSet<Kd extends AnyKind> implements Iterable<ValueOf<Kd>> {
  #map: ValueMap<Kd, undefined>;
  constructor(kind: Kd) { this.#map = new ValueMap(kind); }
  get size(): number { return this.#map.size; }
  add(value: ValueOf<Kd>): this { this.#map.set(value, undefined); return this; }
  has(value: ValueOf<Kd>): boolean { return this.#map.has(value); }
  delete(value: ValueOf<Kd>): boolean { return this.#map.delete(value); }
  clear(): void { this.#map.clear(); }
  keys(): IterableIterator<ValueOf<Kd>> { return this.#map.keys(); }
  values(): IterableIterator<ValueOf<Kd>> { return this.keys(); }
  *entries(): IterableIterator<[ValueOf<Kd>, ValueOf<Kd>]> { for (const value of this) yield [value, value]; }
  [Symbol.iterator](): IterableIterator<ValueOf<Kd>> { return this.values(); }
  forEach(callback: (value: ValueOf<Kd>, key: ValueOf<Kd>, set: this) => void, thisArg?: unknown): void {
    for (const value of this) callback.call(thisArg, value, value, this);
  }
  get [Symbol.toStringTag](): string { return 'ValueSet'; }
}
