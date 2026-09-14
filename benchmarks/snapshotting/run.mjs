import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const directory = fileURLToPath(new URL('./results/', import.meta.url));
const profile = process.env.BENCH_PROFILE ?? 'default';
if (!['default', 'full'].includes(profile))
  throw new Error(`Unknown BENCH_PROFILE: ${profile}`);
const profileConfig =
  profile === 'full'
    ? { repetitions: 7, stringOps: 500000, structuredOps: 50000 }
    : { repetitions: 3, stringOps: 100000, structuredOps: 10000 };
const repetitions = Number(process.env.BENCH_REPS ?? profileConfig.repetitions);
const stringOps = Number(process.env.BENCH_STRING_OPS ?? profileConfig.stringOps);
const structuredOps = Number(
  process.env.BENCH_STRUCTURED_OPS ?? profileConfig.structuredOps,
);
const caseLimit = Number(process.env.BENCH_CASE_LIMIT ?? 0);
const gcDiagnostics = process.env.BENCH_GC_DIAGNOSTICS !== '0';
const shapes = ['string', 'flat50', 'flat100', 'flat500', 'nested50x10'];
const ratios = [1, 0.9, 0.5, 0];
const variants = ['seal', 'zod'];
const cases = [];

for (const shape of shapes) {
  for (const liveHitRatio of ratios) {
    cases.push({
      experiment: 'throughput',
      shape,
      liveHitRatio,
      ops: shape === 'string' ? stringOps : structuredOps,
    });
  }
}
if (caseLimit > 0) cases.length = Math.min(cases.length, caseLimit);

function runWorker(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(new URL('./worker.mjs', import.meta.url)),
        JSON.stringify(config),
      ],
      { cwd: root },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${JSON.stringify(config)} exited ${code}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

function sourceHashes() {
  return Object.fromEntries(
    ['README.md', 'run.mjs', 'summarize.mjs', 'worker.mjs'].map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(new URL(name, import.meta.url)))
        .digest('hex'),
    ]),
  );
}

function captureEnvironment() {
  return {
    date: new Date().toISOString(),
    node: process.version,
    versions: process.versions,
    os: os.type(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().map(({ model, speed }) => ({ model, speed })),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadStart: os.loadavg(),
    sha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    status: execFileSync('git', ['status', '--short'], {
      cwd: root,
      encoding: 'utf8',
    }),
    zod: JSON.parse(
      execFileSync(
        process.execPath,
        ['-e', "console.log(JSON.stringify(require('zod/package.json').version))"],
        { cwd: root, encoding: 'utf8' },
      ),
    ),
    repetitions,
    profile,
    stringOps,
    structuredOps,
    caseLimit: caseLimit || null,
    gcDiagnostics,
    flags: ['--expose-gc'],
    sourceHashes: sourceHashes(),
  };
}

mkdirSync(directory, { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

const environment = captureEnvironment();
const raw = [];
const diagnostics = [];

function save() {
  writeFileSync(`${directory}/environment.json`, JSON.stringify(environment, null, 2) + '\n');
  writeFileSync(`${directory}/raw.json`, JSON.stringify({ environment, results: raw }, null, 2) + '\n');
  writeFileSync(
    `${directory}/gc-diagnostics.json`,
    JSON.stringify({ environment, results: diagnostics }, null, 2) + '\n',
  );
}

for (let rep = 0; rep < repetitions; rep++) {
  for (let c = 0; c < cases.length; c++) {
    const spec = cases[(c + rep * 3) % cases.length];
    for (let v = 0; v < variants.length; v++) {
      const variant = variants[(v + rep) % variants.length];
      console.log(
        `Throughput rep ${rep + 1}/${repetitions}, case ${c + 1}/${cases.length}, ${spec.shape}, hit ${(spec.liveHitRatio * 100).toFixed(0)}%, ${variant}.`,
      );
      raw.push(await runWorker({ ...spec, variant, rep }));
      save();
    }
  }
  console.log(`Throughput repetition ${rep + 1}/${repetitions} saved.`);
}

if (gcDiagnostics) {
  const diagnosticCases = caseLimit > 0 ? cases : null;
  for (const shape of shapes) {
    const ops = shape === 'string' ? stringOps : structuredOps;
    const liveHitRatios = diagnosticCases
      ? diagnosticCases
          .filter((entry) => entry.shape === shape)
          .map((entry) => entry.liveHitRatio)
      : ratios;
    for (const liveHitRatio of liveHitRatios)
      for (const variant of variants) {
        console.log(
          `Retained-heap case ${shape}, hit ${(liveHitRatio * 100).toFixed(0)}%, ${variant}.`,
        );
        diagnostics.push(
          await runWorker({
            experiment: 'retainedHeap',
            shape,
            liveHitRatio,
            ops,
            variant,
            rep: 0,
          }),
        );
      }
    save();
  }
}

environment.loadEnd = os.loadavg();
save();
const summarizeEnv = { ...process.env };
delete summarizeEnv.BENCH_LABEL;
execFileSync(process.execPath, [fileURLToPath(new URL('./summarize.mjs', import.meta.url))], {
  cwd: root,
  env: summarizeEnv,
  stdio: 'inherit',
});

const label = process.env.BENCH_LABEL;
if (label) {
  for (const name of ['environment.json', 'raw.json', 'gc-diagnostics.json', 'summary.json', 'interpretation.md']) {
    const source = `${directory}/${name}`;
    if (!existsSync(source)) continue;
    renameSync(source, `${directory}/${label}-${name}`);
  }
}
