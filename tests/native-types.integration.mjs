import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createDatabaseAdapter } from '../dist/lib/database-adapter.js';
const value=process.env.PRISMA_TEST_DATABASE_URL;
if(!value)throw new Error('Isolated binding URL required');
const url=new URL(value);
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/codex_prisma7_')||url.searchParams.get('channel_binding')!=='require')throw new Error('Isolated mandatory-binding DB only');
test('native Prisma retains scalar, JSON and array type contracts and rejects unsupported types safely',async()=>{
  const prisma=new PrismaClient({adapter:createDatabaseAdapter(value)});
  try {
    const rows=await prisma.$queryRaw`SELECT '2026-01-02 03:04:05.123'::timestamp AS ts, '2026-01-02 12:04:05.123+09'::timestamptz AS tz, '{"a":1}'::jsonb AS json, ARRAY['2026-01-02 03:04:05.123'::timestamp] AS dates, 1234567890123::bigint AS big, 12.34::numeric AS num`;
    assert.equal(rows[0].ts.toISOString(),'2026-01-02T03:04:05.123Z');
    assert.equal(rows[0].tz.toISOString(),'2026-01-02T03:04:05.123Z');
    assert.deepEqual(rows[0].json,{a:1});
    assert.equal(rows[0].dates[0].toISOString(),'2026-01-02T03:04:05.123Z');
    assert.equal(rows[0].big,1234567890123n);assert.equal(rows[0].num.toString(),'12.34');
    await assert.rejects(prisma.$queryRaw`SELECT '1/2'::pg_lsn AS unsupported`);
    assert.equal((await prisma.$queryRaw`SELECT 1::int4 AS value`)[0].value,1);
  } finally {await prisma.$disconnect();}
});

test('native URI preserves spaces in CA paths and application names',async()=>{
  const {mkdtempSync,copyFileSync,unlinkSync,rmdirSync}=await import('node:fs');
  const {join,isAbsolute}=await import('node:path');
  const root=process.env.PRISMA_TEST_SCRATCH;if(!root||!isAbsolute(root))throw new Error('Absolute scratch required');
  const directory=mkdtempSync(join(root,'ca space-'));const file=join(directory,'ca.pem');
  copyFileSync(url.searchParams.get('sslrootcert'),file);
  const alternate=new URL(value);alternate.searchParams.set('sslrootcert',file);alternate.searchParams.set('application_name','synthetic binding test');
  const prisma=new PrismaClient({adapter:createDatabaseAdapter(alternate.toString())});
  try{assert.equal((await prisma.$queryRaw`SELECT current_setting('application_name') AS name`)[0].name,'synthetic binding test');}
  finally{await prisma.$disconnect();unlinkSync(file);rmdirSync(directory);}
});

test('explicit native URL wins over unrelated PGHOST defaults',async()=>{
  const {spawnSync}=await import('node:child_process');
  const code="import {PrismaClient} from './dist/generated/prisma/client.js';import {createDatabaseAdapter} from './dist/lib/database-adapter.js';const client=new PrismaClient({adapter:createDatabaseAdapter(process.env.PRISMA_TEST_DATABASE_URL)});try{await client.$queryRawUnsafe('SELECT 1');}finally{await client.$disconnect();}";
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,PGHOST:'not-configured.invalid',PGPORT:'not-a-port'},encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,'the explicitly configured URI must remain authoritative');
});
