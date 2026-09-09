// Shared across installed package copies in this realm. Store names, never Parts.
const key = Symbol.for('sealed-semantics/kinds');
const global = globalThis as typeof globalThis & { [key]?: Set<string> };
if (!Object.hasOwn(global, key)) {
  Object.defineProperty(global, key, { value: new Set<string>() });
}
const registry = global[key];
if (!(registry instanceof Set)) {
  throw new TypeError('Invalid sealed-semantics realm kind registry');
}
const seen = registry;
export function register(kind: string): void {
  if (Set.prototype.has.call(seen, kind))
    throw new TypeError(`Duplicate kind: ${kind} (sealed-semantics realm registry)`);
  Set.prototype.add.call(seen, kind);
}
