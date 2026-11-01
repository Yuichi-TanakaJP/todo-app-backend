import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const require=createRequire(import.meta.url);
const {deepmerge}=createRequire(require.resolve('@prisma/config'))('deepmerge-ts');
test('Prisma config merger terminates when both inputs contain recursive object graphs',()=>{
  const left={};left.self=left;
  const right={};right.self=right;
  const result=deepmerge(left,right);
  assert.equal(result.self,result);
  assert.deepEqual(deepmerge({nested:{left:1}},{nested:{right:2}}),{nested:{left:1,right:2}});
});
