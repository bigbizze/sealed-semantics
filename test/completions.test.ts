import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript-5-7';
import { resolve } from 'node:path';

test('autocomplete suggests only configured documentation and law capabilities', () => {
  const filename = resolve('test/completion-fixture.ts');
  const source = `import {defineSeal,defineMint} from '../src/index.js';
    import {assertValueLaws,assertMintedLaws} from '../src/laws.js';
    import * as fc from 'fast-check';
    import {z} from 'zod';
    const ok = <T,>(value:T) => ({ok:true as const,value});
    const BasicBuilder=defineSeal({ key: parts => parts,name:'completion/basic',
schema:z.string()});
const Basic=BasicBuilder.seal();
    const FullBuilder=defineSeal({ key: parts => parts,name:'completion/full',
schema:z.string(),
allocate:()=>''}).view({suffix:p=>p.slice(-6)});
const Full=FullBuilder.seal();
    const MintedBuilder=defineMint({name:'completion/minted',
mint:(s:string)=>ok(s)});
const Minted=MintedBuilder.seal();
    const ViewedBuilder=defineMint({name:'completion/viewed',
mint:(s:string)=>ok(s)}).view({suffix:p=>p.slice(-6)});
const Viewed=ViewedBuilder.seal();
    const Domain=defineMint({name:'completion/domain',mint:()=>({ok:false as const,error:{code:'denied' as const,detail:'reason'}})}).seal();
    const rejected=Domain.mint(undefined);
    if(!rejected.ok) { rejected.error./*domainError*/; }
    BasicBuilder.docs({ /*basic*/ }).seal();
    FullBuilder.docs({ /*full*/ }).seal();
    MintedBuilder.docs({ /*minted*/ }).seal();
    ViewedBuilder.docs({ /*viewed*/ }).seal();
    FullBuilder.docs({view:{ /*names*/ }}).seal();
    BasicBuilder.docs({examples:[{ /*basicExample*/ }]}).seal();
    FullBuilder.docs({examples:[{ /*fullExample*/ }],view:{suffix:{description:'Suffix'}}}).seal();
    FullBuilder.docs({examples:[{input:'x',encoded:'x'}],view:{suffix:{ /*projectionDoc*/ }}}).seal();
    assertValueLaws(Basic,{validWire:fc.string(), /*basicLaws*/ });
    assertValueLaws(Full,{validWire:fc.string(), /*fullLaws*/ });
    assertMintedLaws(Minted,{validInput:fc.string(), /*mintedLaws*/ });
    assertMintedLaws(Viewed,{validInput:fc.string(), /*viewedLaws*/ });
    defineSeal({ /*definition*/ });
    defineMint({ /*mintedDefinition*/ });
    defineSeal({name:'completion/primitive',schema:z.string(), /*primitiveDefinition*/ });
    defineSeal({name:'completion/object',schema:z.object({x:z.number()}), /*objectDefinition*/ });
    const instance=Basic.codec.parse('x');
    instance./*instance*/;
    Minted./*mintedKind*/;
    BasicBuilder./*builder*/;
    Basic./*name*/;
    BasicBuilder.docs({examples:[{input:'x',encoded:'x'}]})./*documentedBuilder*/;

  `;
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ['node'],
  };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [filename],
    getScriptVersion: () => '0',
    getScriptSnapshot: (name) => {
      const text = name === filename ? source : ts.sys.readFile(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: (name) => name === filename || ts.sys.fileExists(name),
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    realpath: (path) => ts.sys.realpath?.(path) ?? path,
  };
  const service = ts.createLanguageService(host);
  try {
    // Empty editing positions deliberately omit required documentation. Errors
    // may occur there, but never in the producer definitions or law calls.
    for (const diagnostic of service.getSemanticDiagnostics(filename)) {
      assert(
        diagnostic.start! >= source.indexOf('BasicBuilder.docs('),
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    }
    const expected: Record<string, string[]> = {
      domainError: ['code', 'detail'],
      definition: ['name', 'schema', 'allocate', 'key', 'debug'],
      primitiveDefinition: ['key', 'allocate', 'debug'],
      objectDefinition: ['key', 'allocate', 'debug'],
      instance: ['debug', 'toJSON', 'valueOf'],
      mintedKind: ['name', 'is', 'mint'],
      mintedDefinition: ['name', 'mint', 'debug'],
      builder: ['view', 'docs', 'seal'],
      name: ['name', 'is', 'codec'],
      documentedBuilder: ['docs', 'view', 'seal'],
      basic: ['description', 'examples', 'view'],
      full: ['description', 'examples', 'view'],
      minted: ['description', 'view'],
      viewed: ['description', 'view'],
      names: ['suffix'],
      basicExample: ['input', 'encoded'],
      fullExample: ['input', 'encoded'],
      projectionDoc: ['description', 'example'],
      basicLaws: ['equivalentAliases'],
      fullLaws: ['equivalentAliases', 'allocateArgs'],
    };
    for (const [marker, names] of Object.entries(expected)) {
      const position = source.indexOf(`/*${marker}*/`);
      const completions = service.getCompletionsAtPosition(filename, position, {});
      assert(completions, marker);
      assert.deepEqual(
        completions.entries.map((e) => e.name).sort(),
        names.sort(),
        marker,
      );
    }
  } finally {
    service.dispose();
  }
});
