import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
test('scanner detects duplicate literals across source roots and ignores comments and strings',()=>{
 const root=mkdtempSync(join(tmpdir(),'canonical-kinds-'));
 try {
  writeFileSync(join(root,'a.ts'),`// defineValue({kind:'scan/ignored'})\nconst text="defineValue({kind:'scan/ignored'})";\nconst A=defineValue({wire:z.string(),kind:'scan/one',decode:w=>ok(w)}).with({toWireShape:p=>p});`);
  writeFileSync(join(root,'b.ts'),`const B=otherCopy.defineDerived({kind:'scan/two',derive:()=>ok(1)}).with({});`);
  const run=(...args:string[])=>spawnSync(process.execPath,[resolve('bin/check-kinds.mjs'),...args],{encoding:'utf8'});
  assert.equal(run(root).status,0);
  writeFileSync(join(root,'b.ts'),`const B=otherCopy.defineDerived({kind:'scan/\\u006fne',derive:()=>ok(1)}).with({});`);
  const duplicate=run(join(root,'a.ts'),join(root,'b.ts'));assert.equal(duplicate.status,1);assert.match(duplicate.stderr,/Duplicate kind/);
  assert.equal(run(join(root,'missing.ts')).status,2);
 } finally {rmSync(root,{recursive:true,force:true});}
});
