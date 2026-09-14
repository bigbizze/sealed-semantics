import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { defineSeal } from '../../dist/index.js';

const config = JSON.parse(process.argv[2]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const memory = () => process.memoryUsage();
let sink;

function makeString(index) {
  return `usr_${String(index).padStart(12, '0')}`;
}

function makeFlat(width, index) {
  const value = {};
  for (let i = width - 1; i >= 0; i--) value[`p${String(i).padStart(3, '0')}`] = index + i;
  value.id = `flat-${width}-${index}`;
  return value;
}

function makeNested(index) {
  const value = {};
  for (let i = 49; i >= 0; i--) {
    const child = {};
    for (let j = 9; j >= 0; j--)
      child[`p${String(j).padStart(2, '0')}`] = index + i * 10 + j;
    child.id = `nested-${index}-${i}`;
    value[`node${String(i).padStart(2, '0')}`] = child;
  }
  value.id = `nested-${index}`;
  return value;
}

function makeValue(shape, index) {
  if (shape === 'string') return makeString(index);
  if (shape === 'flat50') return makeFlat(50, index);
  if (shape === 'flat100') return makeFlat(100, index);
  if (shape === 'flat500') return makeFlat(500, index);
  if (shape === 'nested50x10') return makeNested(index);
  throw new Error(`Unknown shape: ${shape}`);
}

function schemaFor(shape) {
  if (shape === 'string') return z.string();
  if (shape.startsWith('flat')) {
    const width = Number(shape.slice(4));
    const fields = { id: z.string() };
    for (let i = 0; i < width; i++)
      fields[`p${String(i).padStart(3, '0')}`] = z.number();
    return z.object(fields);
  }
  if (shape === 'nested50x10') {
    const fields = { id: z.string() };
    for (let i = 0; i < 50; i++) {
      const child = { id: z.string() };
      for (let j = 0; j < 10; j++)
        child[`p${String(j).padStart(2, '0')}`] = z.number();
      fields[`node${String(i).padStart(2, '0')}`] = z.object(child);
    }
    return z.object(fields);
  }
  throw new Error(`Unknown shape: ${shape}`);
}

function keyFor(shape, parts) {
  if (shape === 'string') return parts;
  return parts.id;
}

function makeInputs() {
  const unique = Math.round(config.ops * (1 - config.liveHitRatio));
  const hitCount = config.ops - unique;
  const poolSize = hitCount === 0 ? 0 : Math.min(1000, hitCount);
  const pool = Array.from({ length: poolSize }, (_, i) => makeValue(config.shape, i));
  const inputs = [];
  let uniqueIndex = poolSize;
  for (let i = 0; i < config.ops; i++) {
    if (i < hitCount) inputs.push(pool[i % poolSize]);
    else inputs.push(makeValue(config.shape, uniqueIndex++));
  }
  return { inputs, pool };
}

function makeSubject() {
  const schema = schemaFor(config.shape);
  if (config.variant === 'zod') return { parse: (input) => schema.parse(input) };
  const kind = defineSeal({
    name: `bench/${config.shape}`,
    schema,
    key: (parts) => keyFor(config.shape, parts),
  }).seal();
  return { parse: (input) => kind.codec.parse(input) };
}

async function throughput() {
  const subject = makeSubject();
  const warm = makeInputs();
  for (let i = 0; i < Math.min(5000, warm.inputs.length); i++)
    sink = subject.parse(warm.inputs[i]);
  sink = undefined;
  await tick();
  global.gc();
  await tick();

  const { inputs, pool } = makeInputs();
  const anchors =
    config.variant === 'seal' ? pool.map((input) => subject.parse(input)) : pool;
  await tick();
  global.gc();
  await tick();
  const before = memory();
  const start = performance.now();
  const ring = new Array(256);
  let checksum = 0;
  for (let i = 0; i < inputs.length; i++) {
    const value = subject.parse(inputs[i]);
    ring[i & 255] = value;
    if (config.shape === 'string') checksum += config.variant === 'seal' ? 1 : value.length;
    else checksum += config.variant === 'seal' ? 1 : value.id.length;
  }
  const elapsedMs = performance.now() - start;
  const after = memory();
  sink = [ring, anchors];
  assert.equal(inputs.length, config.ops);
  return {
    ...config,
    elapsedMs,
    opsPerSecond: (config.ops * 1000) / elapsedMs,
    checksum,
    heapDelta: after.heapUsed - before.heapUsed,
    rssDelta: after.rss - before.rss,
  };
}

async function retainedHeap() {
  const subject = makeSubject();
  const { inputs, pool } = makeInputs();
  const anchors =
    config.variant === 'seal' ? pool.map((input) => subject.parse(input)) : pool;
  await tick();
  global.gc();
  await delay(25);
  global.gc();
  await tick();
  const before = memory();
  sink = inputs.map((input) => subject.parse(input));
  assert.equal(sink.length, config.ops);
  await tick();
  global.gc();
  await delay(25);
  global.gc();
  await tick();
  const after = memory();
  return {
    ...config,
    retainedHeap: after.heapUsed - before.heapUsed,
    retainedRss: after.rss - before.rss,
    anchors: anchors.length,
  };
}

const result =
  config.experiment === 'retainedHeap' ? await retainedHeap() : await throughput();
console.log(JSON.stringify(result));
