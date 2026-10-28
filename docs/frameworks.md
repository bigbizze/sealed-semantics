# Frameworks and development

Semantic values can be used in React state and dependency arrays. Equivalent decodes from the same definition return the same live object. Structured view results are cached frozen snapshots, so they need no caller-written `useMemo` solely for reference stability. Producers and projection callbacks must remain deterministic and semantically correct.

Server/client, worker, network, and storage boundaries still require Zod encoding and decoding. Sealed objects are not transport data.

Owned byte storage is separate from sealed identity. Calling `Digest.bytes(digest)` creates a fresh mutable object, so do not use a copy call directly in a dependency array. Depend on the seal or string, or memoize an owned copy in application code when needed. See [digests and byte buffers](bytes.md).

Re-executing a module that completes a definition creates a new definition instance. Values created before the edit still work as values but are foreign to the new definition. Its codec rejects them with a diagnostic explaining the likely cause. After editing a definition module, refresh the page or restart the process to clear preserved state.

Next.js dev, Vite, Vitest, Jest, and Node's test runner need no package-specific configuration. The package holds no global state that could survive a module reset. No bundler plugin or HMR handler is required.

Some bundlers run one module more than once in one process. For example, a Next.js production build with Turbopack has one module graph for route handlers and another for pages. Each graph executes the definition module and creates its own definition instance. A value from one graph is foreign to the other graph's definition, so its codec and observations reject it.

Do not share sealed values, or objects that use definitions, through `globalThis` or another process-wide cache. Share only raw resources, such as database handles, HTTP clients, and configuration. Build the code that decodes, encodes, or observes sealed values in module scope, so that each module graph uses its own definitions:

```ts
const holder = globalThis as typeof globalThis & { appResources?: Resources };
let cached: Runtime | undefined;

export function runtime(): Runtime {
  if (cached) return cached;
  const resources = (holder.appResources ??= openResources());
  cached = { store: openStore(resources.db) };
  return cached;
}
```

The module variable also clears after a dev reload, so the code that uses definitions is built again with the new definitions.

Use `toBe` in Jest and Vitest to assert identity. Distinct minted values have no enumerable state, so `toEqual` can treat them as equal.

Two installed package copies have separate private leaf brands. A foreign copy’s values can supply diagnostic labels but cannot be used as trusted atomic view or Parts leaves.
