import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { databaseConfig } from '../dist/lib/database-config.js';

const local = 'postgresql://synthetic:synthetic@127.0.0.1:56533/codex_prisma7_test';
test('Prisma URL options map to the adapter rather than being silently ignored', () => {
  const {pool,schema} = databaseConfig(local+'?schema=custom&connection_limit=2&connect_timeout=4&pool_timeout=3&max_idle_connection_lifetime=20&max_connection_lifetime=60&pgbouncer=true');
  assert.equal(schema,'custom');
  assert.equal(pool.max,2);
  assert.equal(pool.connectionTimeoutMillis,3000);
  assert.equal(pool.idleTimeoutMillis,20000);
  assert.equal(pool.maxLifetimeSeconds,60);
  const url = new URL(pool.connectionString);
  assert.deepEqual([...url.searchParams.keys()],['sslmode']);
  assert.equal(url.searchParams.get('sslmode'),'disable');
});
test('remote TLS always verifies the certificate and host', () => {
  for (const mode of ['', '?sslmode=require', '?sslmode=prefer', '?sslmode=verify-ca','?sslmode=verify-full']) {
    assert.equal(new URL(databaseConfig('postgresql://synthetic:synthetic@db.example.invalid/db'+mode).pool.connectionString).searchParams.get('sslmode'),'verify-full');
  }
  for (const query of ['sslmode=disable','sslmode=no-verify','ssl=0','uselibpqcompat=true','sslaccept=accept_invalid_certs']) {
    assert.throws(()=>databaseConfig('postgresql://synthetic:synthetic@db.example.invalid/db?'+query),/verification|unsupported/);
  }
});
test('missing/invalid configuration fails without echoing credential input', () => {
  for (const input of [undefined,'not a URL with synthetic-password','https://synthetic:synthetic@db.invalid/db']) {
    assert.throws(()=>databaseConfig(input),error=>!error.message.includes('synthetic-password'));
  }
  for(const option of ['connect_timeout=0','pool_timeout=-1','connection_limit=1.2','connect_timeout=9999999999']) {
    assert.throws(()=>databaseConfig(local+'?'+option),/Invalid database option/);
  }
});

test('query aliases cannot bypass the effective host TLS policy', async () => {
  const { Client } = await import('pg');
  for (const query of ['host=remote.example.invalid','hostaddr=203.0.113.1','ssl=false','sslmode=disable&host=remote.example.invalid']) {
    assert.throws(()=>databaseConfig(local+'?'+query), /unsupported/);
  }
  const client = new Client(databaseConfig('postgresql://synthetic:synthetic@db.example.invalid/db?sslmode=require').pool);
  assert.equal(client.connectionParameters.host,'db.example.invalid');
  assert.notEqual(client.connectionParameters.ssl,false);
  assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized,false);
});

test('CLI uses strict Rust connector TLS and blocks ambient TLS disabling', async () => {
  const { prismaCliUrl }=await import('../dist/lib/database-config.js');
  const cli=new URL(prismaCliUrl('postgresql://synthetic:synthetic@db.example.invalid/db?sslmode=require&sslrootcert='+encodeURIComponent(resolve('synthetic-ca.pem'))));
  assert.equal(cli.searchParams.get('sslaccept'),'strict');
  assert.equal(cli.searchParams.get('sslmode'),'require');
  assert.equal(cli.searchParams.get('sslcert'),resolve('synthetic-ca.pem'));
  assert.equal(cli.searchParams.has('sslrootcert'),false);
  const previous=process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
  try { assert.throws(()=>databaseConfig('postgresql://synthetic:synthetic@db.example.invalid/db'),/verification/); }
  finally {if(previous===undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;else process.env.NODE_TLS_REJECT_UNAUTHORIZED=previous;}
});

test('CA resolution and duplicate options cannot diverge between CLI and runtime',()=>{
  for(const query of ['sslrootcert=relative.pem','sslrootcert=','sslrootcert=a&sslrootcert=b','schema=a&schema=b','sslmode=disable&sslmode=require']){
    assert.throws(()=>databaseConfig(local+'?'+query),/absolute|duplicate/);
  }
});


test('control characters cannot change the effective database URL',()=>{
  assert.throws(()=>databaseConfig(local+'\nDATABASE_URL=postgresql://remote.invalid/unrelated'),/unsupported/);
});
