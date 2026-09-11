import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve('.');
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const metadata = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json']))[0];
assert(metadata.files.some((f) => f.path === 'dist/index.d.ts'));
assert(!metadata.files.some((f) => f.path.startsWith('bin/')));
assert(
  !metadata.files.some(
    (f) =>
      f.path.startsWith('test/') ||
      f.path.startsWith('node_modules/') ||
      f.path.startsWith('examples/'),
  ),
);
const temp = mkdtempSync(join(tmpdir(), 'sealed-semantics-consumer-'));
try {
  writeFileSync(
    join(temp, 'package.json'),
    JSON.stringify({ type: 'module', private: true }),
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(root, metadata.filename),
      `zod@${process.argv[2] ?? '4.1.0'}`,
    ],
    temp,
  );
  assert(
    !existsSync(join(temp, 'node_modules/fast-check')),
    'main consumers must not need the optional test peer',
  );
  run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {defineSeal} from 'sealed-semantics'; import {z} from 'zod'; const K=defineSeal({ key: parts => parts,name:'consumer/no-test-peer',\nschema:z.string(),}).seal(); if (!K.is(K.codec.parse('x'))) throw Error();",
    ],
    temp,
  );
  // Documentation validation runs on import without fast-check.
  writeFileSync(
    join(temp, 'docs-good.mjs'),
    `import {defineSeal,defineMint} from 'sealed-semantics';
    import {z} from 'zod';
    export const Id=defineSeal({ key: parts => parts,name:'consumer/documented',
schema:z.string(),
})
      .docs({examples:[{input:'x',encoded:'x'}]}).seal();
    export const Plan=defineMint({name:'consumer/documented-plan',
mint:i=>({ok:true,value:i})}).docs({}).seal();
  `,
  );
  run(process.execPath, ['docs-good.mjs'], temp);
  const manifest = JSON.parse(
    readFileSync(join(temp, 'node_modules/sealed-semantics/package.json'), 'utf8'),
  );
  assert(!manifest.bin);
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './laws']);
  writeFileSync(
    join(temp, 'docs-bad.mjs'),
    `import {defineMint} from 'sealed-semantics';
    export const Missing=defineMint({name:'consumer/missing-docs',
mint:i=>({ok:true,value:i})}).seal();
    export const Incomplete=defineMint({name:'consumer/missing-view-docs',
mint:i=>({ok:true,value:i})}).view({text:p=>p}).docs({view:{}}).seal();
  `,
  );
  assert.throws(
    () => run(process.execPath, ['docs-bad.mjs'], temp),
    (error) =>
      error.status === 1 && error.stderr.includes('view.text missing description'),
  );
  run(
    'npm',
    [
      'install',
      '--save-dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      'fast-check@^4.9.0',
      '@types/node',
    ],
    temp,
  );
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  // Compile the standalone walkthrough, then check the introductory example separately.
  const walkthrough = readme.slice(
    readme.indexOf('## You can decode individual fields, or a whole response'),
  );
  const code = [...walkthrough.matchAll(/```ts\n([\s\S]*?)```/g)]
    .map((m) => m[1])
    .join('\n');
  writeFileSync(join(temp, 'readme.ts'), code);
  const identifierStart = readme.indexOf('## Define an identifier\n');
  assert(identifierStart >= 0, 'README must include the identifier example section');
  const intro = [
    ...readme
      .slice(
        identifierStart,
        readme.indexOf('## You can decode individual fields, or a whole response'),
      )
      .matchAll(/```ts\n([\s\S]*?)```/g),
  ]
    .map((m) => m[1])
    .join('\n');
  assert(intro.length > 0, 'README must include a runnable introductory example');
  writeFileSync(join(temp, 'intro.ts'), intro);

  // The opening explanation has its own examples, including the PaymentReady mint.
  const opening = readme.slice(
    readme.indexOf('**defineSeal**'),
    readme.indexOf('## AI Generated Description:'),
  );
  assert(opening.includes('const PaymentReady'), 'Opening payment example is missing');
  writeFileSync(
    join(temp, 'opening.ts'),
    "import assert from 'node:assert/strict';\nimport { z } from 'zod';\n" +
      "import { defineSeal, defineMint, type ValueOf } from 'sealed-semantics';\n" +
      [...opening.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n') +
      `
const payment = PaymentReady.mint({ recipientId: userId, amountCents: 100, currency: 'USD' });
assert(payment.ok);
assert.equal(payment.value.view.amountCents, 100);
assert(!PaymentReady.mint({ recipientId: userId, amountCents: 0, currency: 'USD' }).ok);
assert.equal(outgoing, 'usr_0123456789abcdef');
assert.equal(JSON.parse(jsonBody), outgoing);
`,
  );
  const lawDoc = readFileSync(join(root, 'docs/laws.md'), 'utf8');
  writeFileSync(
    join(temp, 'collision-example.ts'),
    [
      ...lawDoc
        .slice(lawDoc.indexOf('## Testing key collisions'))
        .matchAll(/```ts\n([\s\S]*?)```/g),
    ]
      .map((m) => m[1])
      .join('\n'),
  );

  writeFileSync(
    join(temp, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: true,
        types: ['node'],
      },
      include: [
        'readme.ts',
        'intro.ts',
        'opening.ts',
        'collision-example.ts',
        'constraints.ts',
      ],
    }),
  );
  const constraints = readFileSync(join(root, 'spike/inference.ts'), 'utf8')
    .replaceAll("'../src/index.js'", "'sealed-semantics'")
    .replaceAll("'../src/types.js'", "'sealed-semantics'")
    .replaceAll("'../src/laws.js'", "'sealed-semantics/laws'");
  writeFileSync(join(temp, 'constraints.ts'), constraints);
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '-p',
      join(temp, 'tsconfig.json'),
    ],
    temp,
  );
  // Exported inferred definitions must emit portable declarations using root exports.
  writeFileSync(
    join(temp, 'definitions.ts'),
    `import { z } from 'zod';
import { defineSeal, defineMint } from 'sealed-semantics';
export const Id = defineSeal({name:'emit/id', schema:z.string(), key:s=>s}).seal();
export const Bytes = defineSeal({name:'emit/bytes', schema:z.string(), key:s=>s})
  .view({text:s=>s}).copy({bytes:s=>new TextEncoder().encode(s)}).seal();
export const Mint = defineMint({name:'emit/mint', mint:(input:string)=>({ok:true as const,value:input})})
  .view({text:s=>s}).seal();
`,
  );
  writeFileSync(
    join(temp, 'tsconfig.emit.json'),
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: { declaration: true, emitDeclarationOnly: true },
      include: ['definitions.ts'],
    }),
  );
  for (const compiler of ['typescript', 'typescript-5-7']) {
    const output = join(temp, 'emitted-' + compiler);
    run(
      process.execPath,
      [
        join(root, 'node_modules', compiler, 'bin/tsc'),
        '-p',
        join(temp, 'tsconfig.emit.json'),
        '--outDir',
        output,
      ],
      temp,
    );
    const declaration = readFileSync(join(output, 'definitions.d.ts'), 'utf8');
    assert(declaration.includes('import("sealed-semantics").SealedValue'), declaration);
    assert(!/sealed-semantics\/(?:dist|src)|\bProof\b/.test(declaration), declaration);
  }
  cpSync(
    join(temp, 'node_modules/sealed-semantics'),
    join(temp, 'node_modules/sealed-semantics-copy'),
    { recursive: true },
  );
  cpSync(join(temp, 'node_modules/zod'), join(temp, 'node_modules/zod-copy'), {
    recursive: true,
  });
  writeFileSync(
    join(temp, 'smoke.mjs'),
    `import assert from 'node:assert/strict';
 import { z } from 'zod';
 import * as fc from 'fast-check';
 import * as a from 'sealed-semantics';
 import * as b from 'sealed-semantics-copy';
 import { assertValueLaws } from 'sealed-semantics/laws';
 const {z: foreignZod}=await import('zod-copy');
 assert.deepEqual(Object.keys(a).sort(), ['defineMint','defineSeal']);
 const ForeignSchema=a.defineSeal({ key: parts => parts,name:'consumer/foreign-schema',
schema:foreignZod.string(),
}).seal();
 assert(ForeignSchema.is(ForeignSchema.codec.parse('x')));
 const ABuilder=a.defineSeal({ key: parts => parts,name:'consumer/id',schema:z.string()});
 const A=ABuilder.view({text:p=>p}).seal();
 const B=b.defineSeal({ key: parts => parts,name:'consumer/other-id',
schema:z.string(),
}).seal();
 const x=A.codec.parse('x'),y=A.codec.parse('x');
 const Same=b.defineSeal({ key: parts => parts,name:'consumer/id',schema:z.string()}).seal();
 assert(!Same.is(x)); assert.notEqual(Same.codec.parse('x'),x);
 assert.throws(()=>z.encode(Same.codec,x),/different definition instance.*re-executed/);

 assert(!B.is(x)); assert(!A.is(B.codec.parse('x')));
 assert.equal(x,y); assert.equal(new Map([[x,1]]).get(y),1);
 assert.equal(new Set([x,y]).size,1);
 const D=a.defineMint({name:'consumer/proof',
mint:i=>({ok:true,value:i})}).seal();
 const p=D.mint(1).value,q=D.mint(1).value;
 const OtherD=b.defineMint({name:'consumer/proof',mint:i=>({ok:true,value:i})}).seal();
 const foreignEvent=OtherD.mint(1).value;
 assert(!OtherD.is(p));
 assert.throws(()=>foreignEvent.debug.call(p),/debug.*different definition instance.*two copies/);
 const EventHolder=b.defineMint({name:'consumer/event-holder',mint:i=>({ok:true,value:i})}).view({event:p=>p}).seal();
 const heldEvent=EventHolder.mint(p).value;
 assert.throws(()=>heldEvent.view.event,/unsupported object/);
 assert.equal(EventHolder.mint(foreignEvent).value.view.event,foreignEvent);

 assert.notEqual(p,q); assert.equal(new Set([p,q]).size,2);
 const ForeignComposite=b.defineSeal({name:'consumer/foreign-composite',schema:z.object({id:A.codec}),key:p=>p.id.view.text}).seal();
 assert.throws(()=>ForeignComposite.codec.parse({id:'x'}),/keyed Parts.*unsupported object/);
 const Composite=a.defineSeal({name:'consumer/composite',
schema:z.object({id:A.codec}),key:p=>p.id.view.text,
}).view({id:p=>p.id}).seal();
 const c=Composite.codec.parse({id:'x'}),d=Composite.codec.parse({id:'x'});
 assert(A.is(c.view.id));assert.equal(c,d); assert.equal(new Map([[c,1]]).get(d),1);
 assert(Object.isFrozen(c.view));assert.equal(Object.getPrototypeOf(c.view),null);
 assert.deepEqual(Object.keys(a).sort(),['defineMint','defineSeal']);
 assert.notEqual(ABuilder.seal(),A);
 assert.throws(()=>ABuilder.docs({examples:[{input:'x',encoded:'bad'}]}).seal(), /encoded does not match/);
 assertValueLaws(A,{validWire:fc.string()});
 assertValueLaws(Composite,{validWire:fc.record({id:fc.string()})});
 for (const path of ['zod-codec','docs','seal','definition','documentation','codec','keying','interner','structure','sealed-leaf','dist/seal.js','src/seal.ts']) await assert.rejects(import('sealed-semantics/'+path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
 `,
  );
  run(process.execPath, ['smoke.mjs'], temp);
  run(
    process.execPath,
    [join(root, 'node_modules/tsx/dist/cli.mjs'), 'readme.ts'],
    temp,
  );
  run(
    process.execPath,
    [join(root, 'node_modules/tsx/dist/cli.mjs'), 'intro.ts'],
    temp,
  );
  for (const file of ['opening.ts', 'collision-example.ts'])
    run(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), file], temp);
  console.log(
    `Package smoke passed with Zod ${process.argv[2] ?? '4.1.0'}: README, portable declaration emit (current TypeScript and 5.7), declaration constraints, cross-copy brands and native collections, test-only entry, exports, synchronous docs validation.`,
  );
  console.log(`Tarball: ${join(root, metadata.filename)}`);
} catch (error) {
  console.error(error.stdout?.toString() ?? '');
  console.error(error.stderr?.toString() ?? '');
  throw error;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
