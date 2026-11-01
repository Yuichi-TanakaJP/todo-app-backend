import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';

const value = process.env.PRISMA_TEST_DATABASE_URL;
if (!value) throw new Error('PRISMA_TEST_DATABASE_URL is required (isolated DB only)');
const url = new URL(value);
if (!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.startsWith('/codex_prisma7_')) {
  throw new Error('Integration tests require a loopback codex_prisma7_ database');
}
process.env.DATABASE_URL = value;
process.env.NODE_ENV = 'production';
const { prisma } = await import('../dist/lib/prisma.js');
const { default: router } = await import('../dist/routes/todos.js');

test('Prisma 7 adapter retains existing rows and the actual Todo HTTP contract', async () => {
  const app = express();
  app.use(express.json()); app.use('/api/todos',router);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/todos`;
  const json = data=>({headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  let createdId;
  try {
    const legacy = await prisma.todo.findFirst({where:{title:'synthetic-prisma6-sentinel'}});
    assert.ok(legacy,'seed from Prisma 6 must exist');
    assert.equal(legacy.createdAt.toISOString(),'2026-01-02T03:04:05.123Z');
    const original = { id: legacy.id, title:legacy.title, completed:legacy.completed, createdAt:legacy.createdAt.toISOString(), updatedAt:legacy.updatedAt.toISOString() };
    let response = await fetch(base);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).find(row=>row.id===legacy.id),original);
    response = await fetch(base,{method:'POST',...json({title:' synthetic-prisma7-created '})});
    assert.equal(response.status,201);
    const created = await response.json(); createdId=created.id;
    assert.equal(created.title,'synthetic-prisma7-created');
    assert.equal(created.completed,false);
    assert.equal(new Date(created.createdAt).toISOString(),created.createdAt);
    response = await fetch(base+'/'+created.id,{method:'PUT',...json({title:'synthetic-prisma7-updated',completed:true})});
    assert.equal(response.status,200);
    assert.equal((await response.json()).completed,true);
    response = await fetch(base+'/2147483647',{method:'PUT',...json({title:'synthetic-missing'})});
    assert.equal(response.status,404); assert.deepEqual(await response.json(),{error:'todo not found'});
    response = await fetch(base+'/2147483647',{method:'DELETE'});
    assert.equal(response.status,404);
    response = await fetch(base,{method:'POST',...json({title:''})}); assert.equal(response.status,400);
    await assert.rejects(prisma.$transaction(async tx=>{ await tx.todo.create({data:{title:'synthetic-transaction-rollback'}}); throw new Error('synthetic rollback'); }),/synthetic rollback/);
    assert.equal(await prisma.todo.count({where:{title:'synthetic-transaction-rollback'}}),0);
    await prisma.$transaction([prisma.todo.update({where:{id:legacy.id},data:{completed:true}})]);
    assert.equal((await prisma.todo.findUnique({where:{id:legacy.id}})).completed,true);
    response = await fetch(base+'/'+created.id,{method:'DELETE'});
    assert.equal(response.status,204); assert.equal(await response.text(),''); createdId=undefined;
    assert.equal(await prisma.todo.findUnique({where:{id:created.id}}),null);
  } finally {
    if(createdId) await prisma.todo.deleteMany({where:{id:createdId}});
    await new Promise(resolve=>server.close(resolve));
    await prisma.$disconnect();
  }
});
