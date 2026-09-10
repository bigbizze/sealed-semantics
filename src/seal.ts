import { makeInterner } from './interner.js';
import { NAME_LABEL, foreignValue, SealedLeaf, LEAF_TOKEN } from './sealed-leaf.js';
import { dataGraph, sameParts, immutableView } from './structure.js';
import type { SemanticKey } from './types.js';
const CONSTRUCT: unique symbol = Symbol('sealed-semantics/construct');
function makeSeal<P>(
  definitionName: string,
  ops: {
    semantic?: boolean;
    view?: Record<string, (parts: P) => unknown> | undefined;
    debug?: ((parts: P) => string) | undefined;
  },
): {
  is: (x: unknown) => boolean;
  read: (x: unknown) => P;
  seal: (parts: P) => object;
} {
  const view = Object.entries(ops.view ?? {});
  let hasBrand!: (x: unknown) => x is Sealed;
  let unseal!: (x: unknown, operation?: string) => P;
  const trap = (): never => {
    throw new TypeError(
      ops.semantic
        ? `${definitionName} cannot be serialized implicitly; use z.encode(Kind.codec, value) or z.encode with the enclosing contract schema`
        : `${definitionName} has no external representation and cannot be serialized`,
    );
  };
  class Sealed extends SealedLeaf {
    #parts: P;
    #view?: Readonly<Record<string, unknown>>;
    constructor(token: typeof CONSTRUCT, parts: P) {
      if (token !== CONSTRUCT)
        throw new TypeError(`${definitionName} cannot be constructed directly`);
      super(LEAF_TOKEN);
      this.#parts = parts;
      Object.freeze(this);
    }
    static {
      if (view.length)
        Object.defineProperty(this.prototype, 'view', {
          get: function (this: Sealed) {
            unseal(this, 'view');
            if (!this.#view) {
              const facade = Object.create(null) as Record<string, unknown>;
              for (const [name, project] of view) {
                let ready = false;
                let cached: unknown;
                let computing = false;
                Object.defineProperty(facade, name, {
                  enumerable: true,
                  get: () => {
                    if (ready) return cached;
                    if (computing)
                      throw new TypeError(
                        `${definitionName}.view.${name}: recursive projection access`,
                      );
                    computing = true;
                    try {
                      cached = immutableView(
                        project(unseal(this, `view.${name}`)),
                        `${definitionName}.view.${name}`,
                      );
                      ready = true;
                      return cached;
                    } finally {
                      computing = false;
                    }
                  },
                });
              }
              this.#view = Object.freeze(facade);
            }
            return this.#view;
          },
        });
      hasBrand = (x: unknown): x is Sealed =>
        typeof x === 'object' && x !== null && #parts in x;
      unseal = (x: unknown, operation = 'unseal'): P => {
        if (!hasBrand(x))
          throw new TypeError(foreignValue(definitionName, x, operation));
        return x.#parts;
      };
    }
    get [NAME_LABEL](): string {
      if (!hasBrand(this)) throw new TypeError('Invalid sealed name receiver');
      return definitionName;
    }
    [Symbol.for('nodejs.util.inspect.custom')](): string {
      unseal(this, 'inspection');
      return `Sealed<${definitionName}>`;
    }
    get [Symbol.toStringTag](): string {
      unseal(this, 'inspection');
      return `Sealed<${definitionName}>`;
    }
    debug(): string {
      const p = unseal(this, 'debug');
      return ops.debug ? ops.debug(p) : definitionName;
    }
    toJSON(): never {
      return trap();
    }
    valueOf(): never {
      return trap();
    }
    [Symbol.toPrimitive](): never {
      return trap();
    }
  }
  Object.freeze(Sealed.prototype);
  Object.freeze(Sealed);
  return {
    is: hasBrand,
    read: unseal,
    seal: (parts: P) => new Sealed(CONSTRUCT, parts),
  };
}

export function makeMintedSeal<P>(
  definitionName: string,
  ops: {
    view?: Record<string, (parts: P) => unknown>;
    debug?: ((parts: P) => string) | undefined;
  },
) {
  return makeSeal(definitionName, ops);
}
function semanticKey(value: unknown, definitionName: string): SemanticKey {
  if (
    value === null ||
    ['string', 'number', 'bigint', 'boolean', 'undefined'].includes(typeof value)
  )
    return value as SemanticKey;
  throw new TypeError(
    `${definitionName}: semantic key must be a string, number, bigint, boolean, null, or undefined. key(parts) must return a supported primitive.`,
  );
}
export function makeSemanticSeal<P>(
  definitionName: string,
  ops: {
    view?: Record<string, (parts: P) => unknown>;
    debug?: ((parts: P) => string) | undefined;
    key: (parts: P) => SemanticKey;
  },
) {
  const bridge = makeSeal(definitionName, { ...ops, semantic: true });
  const interner = makeInterner<object>();
  return {
    ...bridge,
    seal: (parts: P) => {
      dataGraph(parts, `${definitionName}: keyed Parts`, true);
      const key = semanticKey(ops.key(parts), definitionName);
      const existing = interner.get(key);
      if (existing) {
        const stored = bridge.read(existing);
        dataGraph(stored, `${definitionName}: stored Parts`, true);
        if (!sameParts(stored, parts))
          throw new TypeError(
            `${definitionName}: semantic identity collision for key ${typeof key === 'string' ? JSON.stringify(key) : String(key)}`,
          );
        return existing;
      }
      const value = bridge.seal(parts);
      interner.put(key, value);
      return value;
    },
  };
}
