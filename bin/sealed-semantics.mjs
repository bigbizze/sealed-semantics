#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertDocs } from '../dist/docs.js';
import { documentationShape } from '../dist/documentation.js';

const [command, ...files] = process.argv.slice(2);
if (command !== 'check-docs' || files.length === 0) {
  console.error('Usage: sealed-semantics check-docs <built definition module...>');
  process.exitCode = 2;
} else {
  try {
    const kinds = new Set();
    for (const file of files) {
      const exports = await import(pathToFileURL(resolve(file)).href);
      for (const value of Object.values(exports)) {
        if (
          value &&
          typeof value === 'object' &&
          (documentationShape(value) ||
            (typeof value.kind === 'string' &&
              typeof value.is === 'function' &&
              (typeof value.parse === 'function' ||
                typeof value.derive === 'function')))
        )
          kinds.add(value);
      }
    }
    if (!kinds.size)
      throw new Error(
        'No exported definitions found. Pass modules built against this package copy.',
      );
    assertDocs([...kinds]);
    console.log(`Checked documentation for ${kinds.size} exported definitions.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
