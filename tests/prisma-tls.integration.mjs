import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseAdapter } from '../dist/lib/database-adapter.js';
import { Pool } from 'pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { databaseConfig } from '../dist/lib/database-config.js';
const value=process.env.PRISMA_TEST_DATABASE_URL;
const ca=process.env.PRISMA_TEST_CA_PATH;
if(!value || !ca) throw new Error('Isolated test URL and CA path required');
const url=new URL(value);
if(!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.startsWith('/codex_prisma7_')) throw new Error('Loopback test DB only');
url.searchParams.set('sslmode','verify-full');
url.searchParams.delete('sslrootcert');
const clientFor=value=>new PrismaClient({adapter:createDatabaseAdapter(value)});

if(process.env.PRISMA_TEST_EXPECT_HOSTNAME_FAILURE==='1') {
  test('trusted CA cannot bypass a mismatching PostgreSQL hostname',async()=>{
    url.searchParams.set('sslrootcert',ca);
    const client=clientFor(url.toString());
    try{await assert.rejects(client.$queryRaw`SELECT 1`,/Hostname\/IP|certificate|altname|IP address/i);}finally{await client.$disconnect();}
  });
} else {
  test('self-signed PostgreSQL fails without CA trust and succeeds with explicit trusted CA',async()=>{
    const untrusted=clientFor(url.toString());
    try{await assert.rejects(untrusted.$queryRaw`SELECT 1`,/self.signed|certificate/i);}finally{await untrusted.$disconnect();}
    url.searchParams.set('sslrootcert',ca);
    const trusted=clientFor(url.toString());
    try {
      await trusted.$connect();
      assert.equal((await trusted.$queryRaw`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`)[0].ssl,true);
      assert.ok(await trusted.todo.count()>=0);
    } finally{await trusted.$disconnect();}
  });
  test('the configured pool limit bounds acquisition wait and releases connections',async()=>{
    const poolUrl=new URL(value);
    poolUrl.searchParams.set("connection_limit","1");
    poolUrl.searchParams.set("pool_timeout","1");
    poolUrl.searchParams.set("connect_timeout","2");
    const prisma=clientFor(poolUrl.toString());
    let release;let signal;
    const ready=new Promise(resolve=>{signal=resolve;});
    const held=new Promise(resolve=>{release=resolve;});
    const transaction=prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT 1`;signal();await held;},{timeout:5000});
    try {
      await Promise.race([ready,transaction.then(()=>{throw new Error("transaction ended before acquiring its connection");})]);
      try{await assert.rejects(prisma.$queryRaw`SELECT 1`,/timeout/i);}finally{release();await transaction;}
      assert.equal((await prisma.$queryRaw`SELECT 1::int4 AS value`)[0].value,1);
    } finally {release();await transaction.catch(()=>{});await prisma.$disconnect();}
  });
}
