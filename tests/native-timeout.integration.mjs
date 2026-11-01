import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:net';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createDatabaseAdapter } from '../dist/lib/database-adapter.js';
test('mandatory native connection is bounded when the TLS peer accepts TCP but stays silent',async()=>{
  const sockets=new Set();let bytes=0;
  const server=createServer(socket=>{sockets.add(socket);socket.on('data',data=>{bytes+=data.length;});socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
  server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`postgresql://synthetic:synthetic@127.0.0.1:${server.address().port}/codex_prisma7_timeout?sslmode=verify-full&channel_binding=require&connect_timeout=1&pool_timeout=1`;
  const prisma=new PrismaClient({adapter:createDatabaseAdapter(url)});
  const started=Date.now();
  try {
    await assert.rejects(prisma.$queryRaw`SELECT 1`,/timeout|timed out/i);
    await prisma.$disconnect();
    while(sockets.size&&Date.now()-started<6500)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(sockets.size,0,'libpq worker must terminate its connection');
    assert.ok(Date.now()-started<6500);assert.equal(bytes,8,'only the SSL negotiation request may be sent');
  } finally {for(const socket of sockets)socket.destroy();await prisma.$disconnect();await new Promise(resolve=>server.close(resolve));}
});
