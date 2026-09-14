import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineSeal } from '../src/index.js';

const SUFFIX =
  "Search your codebase for the string 'hostile/Id' to find the definition.";

function defineAndCheck(expectPointer: boolean | 'any') {
  const Id = defineSeal({
    name: 'hostile/Id',
    schema: z.string(),
    key: (s) => s,
  }).seal();
  const v = Id.codec.parse('x');
  assert.equal(Id.is(v), true);
  assert.throws(
    () => JSON.stringify(v),
    (e: unknown) => {
      assert(e instanceof TypeError);
      assert(e.message.includes(SUFFIX), e.message);
      if (expectPointer !== 'any')
        assert.equal(e.message.includes('Defined at'), expectPointer, e.message);
      return true;
    },
  );
}

test('captureStackTrace removed: definitions and errors still work (fallback path)', () => {
  const prev = Error.captureStackTrace;
  try {
    // @ts-expect-error simulate engine without it
    delete Error.captureStackTrace;
    defineAndCheck('any');
  } finally {
    Error.captureStackTrace = prev;
  }
});

test('stackTraceLimit setter throws (hardened env): definitions still work, no pointer', () => {
  const desc = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit')!;
  try {
    Object.defineProperty(Error, 'stackTraceLimit', {
      configurable: true,
      get: () => 10,
      set: () => {
        throw new TypeError('frozen');
      },
    });
    defineAndCheck(false);
  } finally {
    Object.defineProperty(Error, 'stackTraceLimit', desc);
  }
});

test('process.cwd throws (deleted working directory): definitions still work, no pointer', () => {
  const prev = process.cwd;
  try {
    process.cwd = () => {
      throw new Error('ENOENT');
    };
    defineAndCheck(false);
  } finally {
    process.cwd = prev;
  }
});

test('globalThis.process undefined (browser-like): definitions still work, no pointer, limit untouched', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'process')!;
  const limit = Error.stackTraceLimit;
  try {
    Object.defineProperty(globalThis, 'process', {
      configurable: true,
      value: undefined,
    });
    defineAndCheck(false);
    assert.equal(Error.stackTraceLimit, limit);
  } finally {
    Object.defineProperty(globalThis, 'process', desc);
  }
});

test('Error.stack getter throws: definitions still work, no pointer', () => {
  const prev = Error.captureStackTrace;
  try {
    Error.captureStackTrace = (o: object) => {
      Object.defineProperty(o, 'stack', {
        get() {
          throw new Error('no stack');
        },
      });
    };
    defineAndCheck(false);
  } finally {
    Error.captureStackTrace = prev;
  }
});
