import { snapshotBytes } from './copy.js';
import { makeInterner } from './interner.js';
import { locateError, locateMessage } from './location.js';
import { NAME_LABEL, foreignValue, SealedLeaf, LEAF_TOKEN } from './sealed-leaf.js';
import { sameParts, immutableView, snapshotData } from './structure.js';
import type { DeepReadonly, SemanticKey } from './types.js';
const CONSTRUCT: unique symbol = Symbol('sealed-semantics/construct');
type SealOps<P> = {
  semantic?: boolean;
  copy?: Record<string, (parts: DeepReadonly<P>) => unknown> | undefined;
  view?: Record<string, (parts: DeepReadonly<P>) => unknown> | undefined;
  debug?: ((parts: DeepReadonly<P>) => string) | undefined;
  definedAt?: string | undefined;
};
function makeSeal<P>(
  definitionName: string,
  ops: SealOps<P>,
): {
  is: (x: unknown) => boolean;
  read: (x: unknown) => DeepReadonly<P>;
  seal: (parts: DeepReadonly<P>) => object;
} {
  const view = Object.entries(ops.view ?? {});
  const copies = Object.entries(ops.copy ?? {});
  const definedAt = ops.definedAt;
  const fail = (message: string): never => {
    throw new TypeError(locateMessage(message, definitionName, definedAt));
  };
  let hasBrand!: (x: unknown) => x is Sealed;
  let unseal!: (x: unknown, operation?: string) => DeepReadonly<P>;
  const trap = (): never => {
    return fail(
      ops.semantic
        ? `${definitionName} cannot be serialized implicitly; use z.encode(Kind.codec, value) or z.encode with the enclosing contract schema`
        : `${definitionName} has no external representation and cannot be serialized`,
    );
  };
  class Sealed extends SealedLeaf {
    #parts: DeepReadonly<P>;
    #view?: Readonly<Record<string, unknown>>;
    #copy?: Readonly<Record<string, () => unknown>>;
    constructor(token: typeof CONSTRUCT, parts: DeepReadonly<P>) {
      if (token !== CONSTRUCT) fail(`${definitionName} cannot be constructed directly`);
      super(LEAF_TOKEN);
      this.#parts = parts;
      Object.freeze(this);
    }
    static {
      if (copies.length)
        Object.defineProperty(this.prototype, 'copy', {
          get: function (this: Sealed) {
            unseal(this, 'copy');
            if (!this.#copy) {
              const facade = Object.create(null) as Record<string, () => unknown>;
              for (const [name, observe] of copies) {
                let computing = false;
                let snapshot: Uint8Array | undefined;
                Object.defineProperty(facade, name, {
                  enumerable: true,
                  value: () => {
                    if (snapshot !== undefined) return new Uint8Array(snapshot);
                    if (computing)
                      fail(
                        `${definitionName}.copy.${name}: recursive copy observation access`,
                      );
                    computing = true;
                    try {
                      const produced = observe(unseal(this, `copy.${name}`));
                      try {
                        snapshot = snapshotBytes(
                          produced,
                          `${definitionName}.copy.${name}`,
                        );
                      } catch (error) {
                        return locateError(error, definitionName, definedAt);
                      }
                      return new Uint8Array(snapshot);
                    } finally {
                      computing = false;
                    }
                  },
                });
              }
              this.#copy = Object.freeze(facade);
            }
            return this.#copy;
          },
        });
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
                      fail(
                        `${definitionName}.view.${name}: recursive projection access`,
                      );
                    computing = true;
                    try {
                      const produced = project(unseal(this, `view.${name}`));
                      try {
                        cached = immutableView(
                          produced,
                          `${definitionName}.view.${name}`,
                        );
                      } catch (error) {
                        return locateError(error, definitionName, definedAt);
                      }
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
      unseal = (x: unknown, operation = 'unseal'): DeepReadonly<P> => {
        if (!hasBrand(x))
          throw new TypeError(foreignValue(definitionName, x, operation, definedAt));
        return x.#parts;
      };
    }
    get [NAME_LABEL](): string {
      if (!hasBrand(this)) throw new TypeError('Invalid sealed name receiver');
      return definitionName;
    }
    [Symbol.for('nodejs.util.inspect.custom')](): string {
      unseal(this, 'inspection');
      return definedAt
        ? `Sealed<${definitionName}> defined at ${definedAt}`
        : `Sealed<${definitionName}>`;
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
    seal: (parts: DeepReadonly<P>) => new Sealed(CONSTRUCT, parts),
  };
}

export function makeMintedSeal<P>(
  definitionName: string,
  ops: {
    copy?: Record<string, (parts: DeepReadonly<P>) => unknown>;
    view?: Record<string, (parts: DeepReadonly<P>) => unknown>;
    debug?: ((parts: DeepReadonly<P>) => string) | undefined;
    definedAt?: string | undefined;
  },
) {
  const bridge = makeSeal(definitionName, ops);
  return {
    ...bridge,
    seal: (parts: P) => {
      try {
        return bridge.seal(
          snapshotData(parts, `${definitionName}: successful mint Parts`),
        );
      } catch (error) {
        return locateError(error, definitionName, ops.definedAt);
      }
    },
  };
}
function semanticKey(
  value: unknown,
  definitionName: string,
  definedAt: string | undefined,
): SemanticKey {
  if (
    value === null ||
    ['string', 'number', 'bigint', 'boolean', 'undefined'].includes(typeof value)
  )
    return value as SemanticKey;
  throw new TypeError(
    locateMessage(
      `${definitionName}: semantic key must be a string, number, bigint, boolean, null, or undefined. key(parts) must return a supported primitive.`,
      definitionName,
      definedAt,
    ),
  );
}
export function makeSemanticSeal<P>(
  definitionName: string,
  ops: {
    copy?: Record<string, (parts: DeepReadonly<P>) => unknown>;
    view?: Record<string, (parts: DeepReadonly<P>) => unknown>;
    debug?: ((parts: DeepReadonly<P>) => string) | undefined;
    definedAt?: string | undefined;
    key: (parts: DeepReadonly<P>) => SemanticKey;
  },
) {
  const bridge = makeSeal(definitionName, { ...ops, semantic: true });
  const interner = makeInterner<object>();
  return {
    ...bridge,
    seal: (parts: P) => {
      let snapshot: DeepReadonly<P>;
      try {
        snapshot = snapshotData(parts, `${definitionName}: keyed Parts`);
      } catch (error) {
        return locateError(error, definitionName, ops.definedAt);
      }
      const key = semanticKey(ops.key(snapshot), definitionName, ops.definedAt);
      const existing = interner.get(key);
      if (existing) {
        const stored = bridge.read(existing);
        if (!sameParts(stored, snapshot))
          throw new TypeError(
            locateMessage(
              `${definitionName}: semantic identity collision for key ${typeof key === 'string' ? JSON.stringify(key) : String(key)}`,
              definitionName,
              ops.definedAt,
            ),
          );
        return existing;
      }
      const value = bridge.seal(snapshot);
      interner.put(key, value);
      return value;
    },
  };
}
