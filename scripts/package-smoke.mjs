import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root=resolve('.');
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const metadata=JSON.parse(run('npm',['pack','--ignore-scripts','--json']))[0];
assert(metadata.files.some(f=>f.path==='dist/index.d.ts'));
assert(metadata.files.some(f=>f.path==='bin/check-kinds.mjs'));
assert(!metadata.files.some(f=>f.path.startsWith('test/') || f.path.startsWith('node_modules/')));
const temp=mkdtempSync(join(tmpdir(),'canonical-type-consumer-'));
try {
 writeFileSync(join(temp,'package.json'),JSON.stringify({type:'module',private:true}));
 run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(root,metadata.filename),`zod@${process.argv[2]??'4.1.0'}`,'fast-check','@types/node'],temp);
 const readme=readFileSync(join(root,'README.md'),'utf8');
 const code=[...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n');
 writeFileSync(join(temp,'readme.ts'),code);
 writeFileSync(join(temp,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,skipLibCheck:true,types:['node']},include:['readme.ts','constraints.ts']}));
 const constraints=readFileSync(join(root,'spike/inference.ts'),'utf8').replaceAll("'../src/index.js'","'canonical-type'").replaceAll("'../src/types.js'","'canonical-type'");
 writeFileSync(join(temp,'constraints.ts'),constraints);
 run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','-p',join(temp,'tsconfig.json')],temp);
 cpSync(join(temp,'node_modules/canonical-type'),join(temp,'node_modules/canonical-type-copy'),{recursive:true});
 writeFileSync(join(temp,'smoke.mjs'),`
 import assert from 'node:assert/strict';
 import { z } from 'zod';
 import * as fc from 'fast-check';
 import * as a from 'canonical-type';
 import * as b from 'canonical-type-copy';
 import { assertValueLaws } from 'canonical-type/laws';
 const A=a.defineValue({kind:'consumer/id',wire:z.string(),decode:w=>a.ok(w)}).with({toWireShape:p=>p});
 const B=b.defineValue({kind:'consumer/id',wire:z.string(),decode:w=>b.ok(w)}).with({toWireShape:p=>p});
 const x=A.parse('x').value,y=A.parse('x').value;
 assert(!B.is(x)); assert(!A.is(B.parse('x').value));
 assert.equal(A.map().set(x,1).get(y),1);
 assert.equal(A.set().add(x).add(y).size,1);
 const D=a.defineDerived({kind:'consumer/proof',derive:i=>a.ok(i)}).with({});
 const p=D.derive(1).value,q=D.derive(1).value;
 assert.equal(D.set().add(p).add(q).size,2);
 const Composite=b.defineValue({kind:'consumer/composite',wire:z.object({id:A.wire}),decode:w=>b.ok(w)}).with({toWireShape:p=>p,fields:{id:p=>p.id}});
 const c=Composite.parse({id:'x'}).value,d=Composite.parse({id:'x'}).value;
 assert(A.is(c.view.id()));assert.equal(Composite.map().set(c,1).get(d),1);
 assert(Object.isFrozen(c.view));assert.equal(Object.getPrototypeOf(c.view),null);
 assert(!('IdMap' in a));assert(!('ValueMap' in a));
 // Internal cross-copy test: exported package paths remain blocked for consumers.
 const foreign=await import('./node_modules/canonical-type-copy/dist/collections.js');
 assert.equal(new foreign.ValueMap(A).set(x,1).get(y),1);
 assert.equal(new foreign.ValueSet(D).add(p).add(q).size,2);
 assertValueLaws(A,{validWire:fc.string()});
 for (const path of ['seal','codec','keying','collections','dist/seal.js','src/seal.ts']) await assert.rejects(import('canonical-type/'+path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
 `);
 run(process.execPath,['smoke.mjs'],temp);
 run(process.execPath,[join(root,'node_modules/tsx/dist/cli.mjs'),'readme.ts'],temp);
 run(process.execPath,[join(temp,'node_modules/canonical-type/bin/check-kinds.mjs'),'readme.ts'],temp);
 console.log(`Package smoke passed with Zod ${process.argv[2]??'4.1.0'}: README, declaration constraints, cross-copy brands/collections, test-only entry, exports, CLI.`);
 console.log(`Tarball: ${join(root,metadata.filename)}`);
} catch(error) { console.error(error.stdout?.toString()??'');console.error(error.stderr?.toString()??'');throw error; }
finally {rmSync(temp,{recursive:true,force:true});}
