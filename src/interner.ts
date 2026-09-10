import type { SemanticKey } from './types.js';

if (typeof WeakRef !== 'function' || typeof FinalizationRegistry !== 'function') {
  throw new Error(
    'sealed-semantics requires WeakRef and FinalizationRegistry in this runtime. In Cloudflare Workers, enable the enable_weak_ref compatibility flag and remove disable_weak_ref. No fallback is supported.',
  );
}

// Cleanup owns a particular reference, not the key forever. Exported only internally
// so ownership can be tested without depending on garbage-collector scheduling.
export function cleanup<V extends object>(
  table: Map<SemanticKey, WeakRef<V>>,
  held: { key: SemanticKey; ref: WeakRef<V> },
): void {
  if (table.get(held.key) === held.ref) table.delete(held.key);
}

export function makeInterner<V extends object>() {
  const table = new Map<SemanticKey, WeakRef<V>>();
  const finalizer = new FinalizationRegistry<{ key: SemanticKey; ref: WeakRef<V> }>(
    (held) => cleanup(table, held),
  );
  return {
    get: (key: SemanticKey) => table.get(key)?.deref(),
    put: (key: SemanticKey, value: V) => {
      const ref = new WeakRef(value);
      table.set(key, ref);
      finalizer.register(value, { key, ref });
    },
  };
}
