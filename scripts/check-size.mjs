import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const files=readdirSync('src').filter(f=>f.endsWith('.ts')).map(f=>'src/'+f).concat('bin/check-kinds.mjs');
const lines=path=>readFileSync(path,'utf8').split('\n').length-1;
const total=files.reduce((n,path)=>n+lines(path),0);
assert(total<400,`Source size ${total} requires the specification's documented exception`);
assert(lines('README.md')<150,'README must remain under 150 lines');
console.log(`${total} source lines including types, law harness, and CLI; ${lines('README.md')} README lines.`);
