import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineSeal, defineMint } from '../src/index.js';

const here = fileURLToPath(import.meta.url);

test('runtime errors and inspect name the definition and point at its call site', () => {
  const DeviceId = defineSeal({
    key: (parts) => parts,
    name: 'kwa/semantic/NormalizedDeviceId',
    schema: z.string(),
  }).seal();
  const value = DeviceId.codec.parse('device-1');
  const inspected = inspect(value);
  assert.match(
    inspected,
    /^Sealed<kwa\/semantic\/NormalizedDeviceId> defined at .+:\d+$/,
  );
  assert(inspected.includes(here), inspected);
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
      assert(error.message.includes(`Defined at ${here}:`), error.message);
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
  assert.match(mintInspect, /^Sealed<kwa\/semantic\/Session> defined at .+:\d+$/);
  assert(mintInspect.includes(here), mintInspect);
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
      assert(error.message.includes(`Defined at ${here}:`), error.message);
      return true;
    },
  );
});
