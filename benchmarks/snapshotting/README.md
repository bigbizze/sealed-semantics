# Snapshotting benchmark

This benchmark compares the public seal codec with the same plain Zod schema.
It is release evidence only. It is not part of `npm run check`, `prepack`, or
the published package.

From the repository root:

```sh
npm run bench:snapshotting
```

The default run uses three rotated fresh-process repetitions. String ID cases
run 100,000 operations per sample. Structured cases run 10,000 operations per
sample. Structured inputs cover flat 50-, 100-, and 500-property objects and a
nested 50-by-10 object graph. Each shape runs with 100%, 90%, 50%, and 0% live
hit ratios.

For full release evidence:

```sh
BENCH_PROFILE=full npm run bench:snapshotting
```

The full profile uses seven repetitions, 500,000 string operations per sample,
and 50,000 structured operations per sample.

For an infrastructure check:

```sh
BENCH_REPS=1 BENCH_CASE_LIMIT=1 BENCH_GC_DIAGNOSTICS=0 npm run bench:snapshotting
```

Files:

- `worker.mjs`: one fresh-process timing or retained-heap sample.
- `run.mjs`: orchestrates rotated repetitions and captures environment data.
- `summarize.mjs`: writes `results/summary.json` and `results/interpretation.md`.
- `results/raw.json`: raw primary throughput results.
- `results/gc-diagnostics.json`: GC-observed retained-heap diagnostics.
- `results/environment.json`: environment metadata.
