import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
const value=process.env.PRISMA_TEST_DATABASE_URL;
const root=process.env.PRISMA_TEST_SCRATCH;
if(!value || !root || !isAbsolute(root))throw new Error('Isolated URL and absolute PRISMA_TEST_SCRATCH required');
if (/[\u0000-\u0020\u007f"'#]/.test(value)) throw new Error("Test URL must be dotenv-safe");
const url=new URL(value);
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/codex_prisma7_'))throw new Error('Isolated DB only');

test('production entry loads a synthetic dotenv URL before client construction',async()=>{
  const directory=mkdtempSync(join(root,'entry-'));
  const file=join(directory,'.env');
  writeFileSync(file,`DATABASE_URL=${url.toString()}\n`);
  const reservation=createServer();reservation.listen(0,'127.0.0.1');
  await new Promise(resolve=>reservation.once('listening',resolve));
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const env={...process.env,NODE_ENV:'production',PORT:String(port),DOTENV_CONFIG_PATH:file};
  delete env.DATABASE_URL;
  const child=spawn(process.execPath,[resolve('dist/index.js')],{cwd:directory,env,stdio:'ignore'});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  try {
    const base=`http://127.0.0.1:${port}`;
    let ready=false;
    for(let i=0;i<200;i++) {
      assert.equal(child.exitCode,null,"production entry exited before becoming ready");
      try {const response=await fetch(base+'/api/health');if(response.status===200){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,'production entry must start');
    const response=await fetch(base+'/api/todos');
    assert.equal(response.status,200);assert.ok(Array.isArray(await response.json()));
  } finally {
    child.kill();await exited;
    // Only this fixture file and its empty, uniquely created directory are removed.
    unlinkSync(file);rmdirSync(directory);
  }
});
