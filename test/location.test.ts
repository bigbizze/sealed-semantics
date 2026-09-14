import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineSeal, defineMint } from '../src/index.js';
import {
  captureDefinedAt,
  definedAtFromStack,
  locateMessage,
} from '../src/location.js';

const TEST_FILE = 'test/location.test.ts';
const here = fileURLToPath(import.meta.url);
const locationFile = fileURLToPath(new URL('../src/location.ts', import.meta.url));
const indexFile = fileURLToPath(new URL('../src/index.ts', import.meta.url));

function captureFromCaller(): string | undefined {
  return captureDefinedAt(captureFromCaller);
}

function restoreNodeEnv(previous: string | undefined): void {
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
}

function withNodeEnv<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.NODE_ENV;
  try {
    if (value === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = value;
    return run();
  } finally {
    restoreNodeEnv(previous);
  }
}

function assertRelativeTestLocation(
  definedAt: string | undefined,
  needle: RegExp,
): void {
  assert.match(definedAt ?? '', new RegExp(`^${TEST_FILE}:\\d+$`));
  const line = Number(definedAt!.slice(TEST_FILE.length + 1));
  const source = readFileSync(new URL(import.meta.url), 'utf8').split('\n')[line - 1];
  assert.match(source ?? '', needle);
}

test('production NODE_ENV skips capture and does not touch stackTraceLimit', () => {
  const previousLimit = Error.stackTraceLimit;
  withNodeEnv('production', () => {
    assert.equal(captureFromCaller(), undefined);
    assert.equal(Error.stackTraceLimit, previousLimit);
  });
  assert.equal(Error.stackTraceLimit, previousLimit);
});

test('development capture is a relative path to the calling test file', () => {
  withNodeEnv(undefined, () => {
    const definedAt = captureFromCaller();
    assertRelativeTestLocation(definedAt, /captureFromCaller\(\)/);
  });
  withNodeEnv('development', () => {
    const definedAt = captureFromCaller();
    assertRelativeTestLocation(definedAt, /captureFromCaller\(\)/);
  });
});

test('a zero stackTraceLimit still yields a pointer and is restored', () => {
  const previous = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    withNodeEnv('development', () => {
      const definedAt = captureFromCaller();
      assertRelativeTestLocation(definedAt, /captureFromCaller\(\)/);
      assert.equal(Error.stackTraceLimit, 0);
    });
  } finally {
    Error.stackTraceLimit = previous;
  }
});

test('a non-function process.cwd skips capture', () => {
  const previous = process.cwd;
  try {
    (process as { cwd: unknown }).cwd = 'not a function';
    withNodeEnv('development', () => {
      assert.equal(captureFromCaller(), undefined);
    });
  } finally {
    process.cwd = previous;
  }
});

test('a missing process.env skips capture', () => {
  const previous = process.env;
  try {
    (process as { env: NodeJS.ProcessEnv | undefined }).env = undefined;
    assert.equal(captureFromCaller(), undefined);
  } finally {
    process.env = previous;
  }
});

test('definedAtFromStack rejects output directories, foreign files, and non-source extensions', () => {
  const cwd = '/proj';
  assert.equal(
    definedAtFromStack('    at foo (/proj/dist/x.js:1:1)', cwd, true),
    undefined,
  );
  assert.equal(
    definedAtFromStack('    at foo (/other/src/app.ts:1:1)', cwd, true),
    undefined,
  );
  assert.equal(
    definedAtFromStack('    at foo (/proj/package.json:1:1)', cwd, true),
    undefined,
  );
  assert.equal(
    definedAtFromStack('    at foo (/proj/Makefile:1:1)', cwd, true),
    undefined,
  );
});

test('definedAtFromStack returns a relative forward-slash path for Windows file URLs', () => {
  assert.equal(
    definedAtFromStack(
      '    at foo (file:///C:/proj/src/app.ts:10:1)',
      'C:\\proj',
      true,
    ),
    'src/app.ts:10',
  );
});

test('fallback parsing skips library and tsx frames before the caller', () => {
  const stack = [
    'Error',
    `    at captureDefinedAt (${locationFile}:40:3)`,
    `    at defineSeal (${indexFile}:104:22)`,
    `    at Object.<anonymous> (${process.cwd()}/node_modules/tsx/dist/register.js:1:1)`,
    `    at caller (${here}:10:5)`,
  ].join('\n');
  assert.equal(definedAtFromStack(stack, process.cwd(), false), `${TEST_FILE}:10`);
});

test('V8 captureStackTrace path uses the first parseable frame as-is', () => {
  const stack = [
    'Error',
    `    at captureDefinedAt (${locationFile}:40:3)`,
    `    at caller (${here}:10:5)`,
  ].join('\n');
  assert.equal(definedAtFromStack(stack, process.cwd(), true), 'src/location.ts:40');
});

test('locateMessage always includes the search suffix and Defined at only when present', () => {
  const without = locateMessage('boom', 'app/id', undefined);
  assert(
    without.includes(
      "Search your codebase for the string 'app/id' to find the definition.",
    ),
  );
  assert(!without.includes('Defined at'));
  const withLocation = locateMessage('boom', 'app/id', 'src/id.ts:4');
  assert(
    withLocation.includes(
      "Search your codebase for the string 'app/id' to find the definition.",
    ),
  );
  assert(withLocation.includes('Defined at src/id.ts:4.'));
});

test('runtime errors and inspect name the definition and point at its call site', () => {
  withNodeEnv('development', () => {
    const DeviceId = defineSeal({
      key: (parts) => parts,
      name: 'kwa/semantic/NormalizedDeviceId',
      schema: z.string(),
    }).seal();
    const value = DeviceId.codec.parse('device-1');
    const inspected = inspect(value);
    assert.match(
      inspected,
      /^Sealed<kwa\/semantic\/NormalizedDeviceId> defined at test\/location\.test\.ts:\d+$/,
    );
    assert.throws(
      () => JSON.stringify(value),
      (error: unknown) => {
        assert(error instanceof TypeError);
        assert.match(error.message, /z\.encode/);
        assert(
          error.message.includes(
            "Search your codebase for the string 'kwa/semantic/NormalizedDeviceId' to find the definition.",
          ),
          error.message,
        );
        assert(error.message.includes(`Defined at ${TEST_FILE}:`), error.message);
        assert(!error.message.includes(here), error.message);
        return true;
      },
    );
    const Session = defineMint({
      name: 'kwa/semantic/Session',
      mint: (input: string) => ({ ok: true as const, value: input }),
    }).seal();
    const minted = Session.mint('s');
    assert(minted.ok);
    const mintInspect = inspect(minted.value);
    assert.match(
      mintInspect,
      /^Sealed<kwa\/semantic\/Session> defined at test\/location\.test\.ts:\d+$/,
    );
    assert.throws(
      () => JSON.stringify(minted.value),
      (error: unknown) => {
        assert(error instanceof TypeError);
        assert(
          error.message.includes(
            "Search your codebase for the string 'kwa/semantic/Session' to find the definition.",
          ),
          error.message,
        );
        assert(error.message.includes(`Defined at ${TEST_FILE}:`), error.message);
        return true;
      },
    );
  });
});

test('production errors keep the search suffix and omit Defined at', () => {
  withNodeEnv('production', () => {
    const DeviceId = defineSeal({
      key: (parts) => parts,
      name: 'kwa/semantic/ProductionDeviceId',
      schema: z.string(),
    }).seal();
    const value = DeviceId.codec.parse('device-1');
    assert.equal(inspect(value), 'Sealed<kwa/semantic/ProductionDeviceId>');
    assert.throws(
      () => JSON.stringify(value),
      (error: unknown) => {
        assert(error instanceof TypeError);
        assert(
          error.message.includes(
            "Search your codebase for the string 'kwa/semantic/ProductionDeviceId' to find the definition.",
          ),
          error.message,
        );
        assert(!error.message.includes('Defined at'), error.message);
        return true;
      },
    );
  });
});
