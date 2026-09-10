# Frameworks and development

Semantic values can be used in React state and dependency arrays. Equivalent decodes from the same definition return the same live object. Structured view results are cached, so they need no caller-written `useMemo` solely for reference stability. Producers and projection callbacks must remain deterministic and logically immutable.

Server/client, worker, network, and storage boundaries still require Zod encoding and decoding. Sealed objects are not transport data.

Re-executing a module that completes a definition creates a new definition instance. Values created before the edit still work as values but are foreign to the new definition. Its codec rejects them with a diagnostic explaining the likely cause. After editing a definition module, refresh the page or restart the process to clear preserved state.

Next.js dev, Vite, Vitest, Jest, and Node's test runner need no package-specific configuration. The package holds no global state that could survive a module reset. No bundler plugin or HMR handler is required.

Use `toBe` in Jest and Vitest to assert identity. Distinct minted values have no enumerable state, so `toEqual` can treat them as equal.
