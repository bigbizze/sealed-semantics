import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./results/', import.meta.url));
const sourceLabel = process.env.BENCH_SOURCE_LABEL;
const outputLabel = process.env.BENCH_LABEL ?? sourceLabel;
const prefix = sourceLabel ? `${sourceLabel}-` : '';
const outputPrefix = outputLabel ? `${outputLabel}-` : '';
const raw = JSON.parse(readFileSync(`${directory}/${prefix}raw.json`, 'utf8'));
const diagnostics = JSON.parse(
  readFileSync(`${directory}/${prefix}gc-diagnostics.json`, 'utf8'),
);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function key(result) {
  return `${result.shape}:${result.liveHitRatio}:${result.variant}`;
}

const groups = new Map();
for (const result of raw.results) {
  const name = key(result);
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(result);
}

const rows = [...groups.entries()]
  .map(([name, results]) => {
    const [shape, liveHitRatio, variant] = name.split(':');
    return {
      shape,
      liveHitRatio: Number(liveHitRatio),
      variant,
      repetitions: results.length,
      ops: results[0].ops,
      medianOpsPerSecond: median(results.map((x) => x.opsPerSecond)),
      medianElapsedMs: median(results.map((x) => x.elapsedMs)),
      medianHeapDelta: median(results.map((x) => x.heapDelta)),
      medianRssDelta: median(results.map((x) => x.rssDelta)),
    };
  })
  .sort(
    (a, b) =>
      a.shape.localeCompare(b.shape) ||
      b.liveHitRatio - a.liveHitRatio ||
      a.variant.localeCompare(b.variant),
  );

const byCase = new Map();
for (const row of rows) {
  const name = `${row.shape}:${row.liveHitRatio}`;
  if (!byCase.has(name)) byCase.set(name, {});
  byCase.get(name)[row.variant] = row;
}

const comparisons = [...byCase.entries()]
  .filter(([, pair]) => pair.seal && pair.zod)
  .map(([name, pair]) => ({
    shape: pair.seal.shape,
    liveHitRatio: pair.seal.liveHitRatio,
    sealOpsPerSecond: pair.seal.medianOpsPerSecond,
    zodOpsPerSecond: pair.zod.medianOpsPerSecond,
    sealVsZodTimeRatio: pair.seal.medianElapsedMs / pair.zod.medianElapsedMs,
  }));

const summary = {
  environment: raw.environment,
  rows,
  comparisons,
  gcDiagnostics: diagnostics.results,
};

writeFileSync(
  `${directory}/${outputPrefix}summary.json`,
  JSON.stringify(summary, null, 2) + '\n',
);

const lines = [
  '# Snapshotting benchmark interpretation',
  '',
  sourceLabel ? `Evidence label: \`${sourceLabel}\`.` : null,
  `Measured ${raw.environment.repetitions} planned fresh-process repetitions per throughput case.`,
  rows.some((row) => row.repetitions !== raw.environment.repetitions)
    ? `This run is partial. Completed case repetitions range from ${Math.min(...rows.map((row) => row.repetitions))} to ${Math.max(...rows.map((row) => row.repetitions))}.`
    : null,
  'Primary results are elapsed time, throughput, heap delta, and RSS delta from non-GC-observed timing workers.',
  'Retained-heap diagnostics are recorded separately in `gc-diagnostics.json` after explicit GC opportunities.',
  '',
  '| shape | live-hit ratio | seal ops/s | plain Zod ops/s | seal/Zod elapsed |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...comparisons.map(
    (row) =>
      `| ${row.shape} | ${(row.liveHitRatio * 100).toFixed(0)}% | ${row.sealOpsPerSecond.toFixed(0)} | ${row.zodOpsPerSecond.toFixed(0)} | ${row.sealVsZodTimeRatio.toFixed(2)}x |`,
  ),
  '',
  'Interpretation:',
  '',
  '- Seal parsing includes Zod validation, snapshot allocation, key computation, interning, and live-hit collision comparison.',
  '- Structured values cost more as descriptor access, property definition, allocation, and freezing increase with graph size.',
  '- 0.4.1 includes a measured snapshot hot-path optimization. Sorting alone was not the main cost; descriptor reads and per-property definition were the larger avoidable costs.',
  '- No performance threshold is attached to 0.4.1.',
].filter(Boolean);

writeFileSync(
  `${directory}/${outputPrefix}interpretation.md`,
  `${lines.join('\n')}\n`,
);
