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
type ViewSlot = { ready: boolean; cached: unknown; computing: boolean };
type CopySlot = { snapshot?: Uint8Array; computing: boolean };
export type SealBridge<P> = {
  is: (x: unknown) => boolean;
  read: (x: unknown) => DeepReadonly<P>;
  seal: (parts: DeepReadonly<P>) => object;
  assert: (x: unknown) => object;
  readView: (x: unknown) => object;
  debug: (x: unknown) => string;
  project: (x: unknown, name: string) => unknown;
  copyBytes: (x: unknown, name: string) => Uint8Array;
};
function makeSeal<P>(definitionName: string, ops: SealOps<P>): SealBridge<P> {
  const view = Object.entries(ops.view ?? {});
  const copies = Object.entries(ops.copy ?? {});
  const projects = new Map(view);
  const observers = new Map(copies);
  const definedAt = ops.definedAt;
  const fail = (message: string): never => {
    throw new TypeError(locateMessage(message, definitionName, definedAt));
  };
  let hasBrand!: (x: unknown) => x is Sealed;
  let unseal!: (x: unknown, operation?: string) => DeepReadonly<P>;
  let assertFn!: (x: unknown) => object;
  let readViewFn!: (x: unknown) => object;
  let debugFn!: (x: unknown) => string;
  let projectFn!: (x: unknown, name: string) => unknown;
  let copyBytesFn!: (x: unknown, name: string) => Uint8Array;
  const trap = (): never => {
    return fail(
      ops.semantic
        ? `${definitionName} cannot be serialized implicitly; use z.encode(Kind.codec, value) or z.encode with the enclosing contract schema`
        : `${definitionName} has no external representation and cannot be serialized`,
    );
  };
  class Sealed extends SealedLeaf {
    #parts: DeepReadonly<P>;
    #viewSlots?: Record<string, ViewSlot>;
    #viewSnapshot?: object;
    #copySlots?: Record<string, CopySlot>;
    constructor(token: typeof CONSTRUCT, parts: DeepReadonly<P>) {
      if (token !== CONSTRUCT) fail(`${definitionName} cannot be constructed directly`);
      super(LEAF_TOKEN);
      this.#parts = parts;
      Object.freeze(this);
    }
    static {
      hasBrand = (x: unknown): x is Sealed =>
        typeof x === 'object' && x !== null && #parts in x;
      unseal = (x: unknown, operation = 'unseal'): DeepReadonly<P> => {
        if (!hasBrand(x))
          throw new TypeError(foreignValue(definitionName, x, operation, definedAt));
        return x.#parts;
      };
      const viewSlots = (instance: Sealed): Record<string, ViewSlot> => {
        if (!instance.#viewSlots) {
          const slots = Object.create(null) as Record<string, ViewSlot>;
          for (const [name] of view)
            slots[name] = { ready: false, cached: undefined, computing: false };
          instance.#viewSlots = slots;
        }
        return instance.#viewSlots;
      };
      const cachedViewGet = (instance: Sealed, name: string): unknown => {
        const slot = viewSlots(instance)[name]!;
        if (slot.ready) return slot.cached;
        if (slot.computing)
          fail(`${definitionName}.${name}: recursive projection access`);
        const project = projects.get(name);
        if (!project) return fail(`${definitionName}: unknown projection "${name}"`);
        slot.computing = true;
        try {
          const produced = project(instance.#parts);
          try {
            slot.cached = immutableView(produced, `${definitionName}.${name}`);
          } catch (error) {
            return locateError(error, definitionName, definedAt);
          }
          slot.ready = true;
          return slot.cached;
        } finally {
          slot.computing = false;
        }
      };
      const copySlots = (instance: Sealed): Record<string, CopySlot> => {
        if (!instance.#copySlots) {
          const slots = Object.create(null) as Record<string, CopySlot>;
          for (const [name] of copies) slots[name] = { computing: false };
          instance.#copySlots = slots;
        }
        return instance.#copySlots;
      };
      const cachedCopyGet = (instance: Sealed, name: string): Uint8Array => {
        const slot = copySlots(instance)[name]!;
        if (slot.snapshot !== undefined) return new Uint8Array(slot.snapshot);
        if (slot.computing)
          fail(`${definitionName}.${name}: recursive copy observation access`);
        const observe = observers.get(name);
        if (!observe)
          return fail(`${definitionName}: unknown copy observation "${name}"`);
        slot.computing = true;
        try {
          const produced = observe(instance.#parts);
          try {
            slot.snapshot = snapshotBytes(produced, `${definitionName}.${name}`);
          } catch (error) {
            return locateError(error, definitionName, definedAt);
          }
          return new Uint8Array(slot.snapshot);
        } finally {
          slot.computing = false;
        }
      };
      assertFn = (x: unknown) => {
        unseal(x, 'assert');
        return x as object;
      };
      readViewFn = (x: unknown) => {
        unseal(x, 'read');
        const instance = x as Sealed;
        if (instance.#viewSnapshot) return instance.#viewSnapshot;
        for (const [name] of view) cachedViewGet(instance, name);
        const snapshot = Object.create(null) as Record<string, unknown>;
        const slots = viewSlots(instance);
        for (const [name] of view) snapshot[name] = slots[name]!.cached;
        Object.freeze(snapshot);
        instance.#viewSnapshot = snapshot;
        return snapshot;
      };
      debugFn = (x: unknown) => {
        const parts = unseal(x, 'debug');
        return ops.debug ? ops.debug(parts) : definitionName;
      };
      projectFn = (x: unknown, name: string) => {
        unseal(x, name);
        return cachedViewGet(x as Sealed, name);
      };
      copyBytesFn = (x: unknown, name: string) => {
        unseal(x, name);
        return cachedCopyGet(x as Sealed, name);
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
    assert: assertFn,
    readView: readViewFn,
    debug: debugFn,
    project: projectFn,
    copyBytes: copyBytesFn,
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
