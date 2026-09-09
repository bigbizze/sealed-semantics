const CONSTRUCT: unique symbol = Symbol('sealed-semantics/construct');
export function makeSeal<P>(kind: string, ops: {
  encode?: (parts: P) => unknown;
  canonical?: ((parts: P) => unknown) | undefined;
  fields?: Record<string, (parts: P) => unknown> | undefined;
  equals?: (a: P, b: P) => boolean;
  debug?: ((parts: P) => string) | undefined;
}): { is: (x: unknown) => boolean; read: (x: unknown) => P; seal: (parts: P) => object } {
  const fields = Object.entries(ops.fields ?? {});
  let hasBrand!: (x: unknown) => x is Sealed;
  let unseal!: (x: unknown) => P;
  const trap = (): never => { throw new TypeError(`${kind} cannot be serialized implicitly; use value.encode() or encode the enclosing contract schema`); };
  class Sealed {
    #parts: P;
    #view?: Readonly<Record<string, () => unknown>>;
    constructor(token: typeof CONSTRUCT, parts: P) {
      if (token !== CONSTRUCT) throw new TypeError(`${kind} cannot be constructed directly`);
      this.#parts = parts;
    }
    static {
      if (fields.length) Object.defineProperty(this.prototype, 'view', { get: function(this: Sealed) {
        unseal(this);
        if (!this.#view) {
          const facade = Object.create(null) as Record<string, () => unknown>;
          for (const [name, project] of fields) Object.defineProperty(facade, name, { enumerable: true, value: () => project(unseal(this)) });
          this.#view = Object.freeze(facade);
        }
        return this.#view;
      } });
      hasBrand = (x: unknown): x is Sealed => typeof x === 'object' && x !== null && #parts in x;
      unseal = (x: unknown): P => {
        if (!hasBrand(x)) throw new TypeError(`${kind} is not a sealed value`);
        return x.#parts;
      };
    }
    equals(other: unknown): boolean {
      const a = unseal(this), b = unseal(other);
      return ops.equals ? ops.equals(a, b) : this === other;
    }
    debug(): string { const p = unseal(this); return ops.debug ? ops.debug(p) : kind; }
    toJSON(): never { return trap(); }
    valueOf(): never { return trap(); }
    [Symbol.toPrimitive](): never { return trap(); }
  }
  if (ops.canonical) Object.defineProperty(Sealed.prototype, 'canonical', { value: function(this: Sealed) { return ops.canonical!(unseal(this)); } });
  if (ops.encode) Object.defineProperty(Sealed.prototype, 'encode', { value: function(this: Sealed) { return ops.encode!(unseal(this)); } });
  return { is: hasBrand, read: unseal, seal: (parts: P) => new Sealed(CONSTRUCT, parts) };
}
