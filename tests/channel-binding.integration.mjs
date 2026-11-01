import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { createDatabaseAdapter } from '../dist/lib/database-adapter.js';
const ca=process.env.PRISMA_TEST_CA_PATH;
const key=process.env.PRISMA_TEST_TLS_KEY_PATH;
if(!ca||!key)throw new Error('Synthetic TLS CA/key paths required');
const context=createSecureContext({cert:readFileSync(ca),key:readFileSync(key)});
const packet=(type,body)=>{const header=Buffer.alloc(5);header.write(type);header.writeInt32BE(body.length+4,1);return Buffer.concat([header,body]);};
const auth=(kind,extra=Buffer.alloc(0))=>{const body=Buffer.alloc(4);body.writeInt32BE(kind);return packet('R',Buffer.concat([body,extra]));};
for(const [name,message] of [
  ['cleartext',auth(3)],['MD5',auth(5,Buffer.from([1,2,3,4]))],
  ['unbound SCRAM',auth(10,Buffer.from('SCRAM-SHA-256\0\0'))],['authentication without a challenge',Buffer.concat([auth(0),packet('S',Buffer.from('server_version\x0017.6\x00')),packet('S',Buffer.from('client_encoding\x00UTF8\x00')),packet('Z',Buffer.from('I'))])],
]) {
  test(`require refuses ${name} before sending any password/proof`,async()=>{
    let passwordFrames=0;let sqlFrames=0;let connectionCount=0;let challengeCount=0;const sockets=new Set();
    const server=createServer(socket=>{
      connectionCount++;sockets.add(socket);socket.on('error',()=>{});
      socket.once('data',request=>{
        assert.equal(request.readInt32BE(4),80877103);
        socket.write('S');
        const tls=new TLSSocket(socket,{isServer:true,secureContext:context});
        sockets.add(tls);tls.on('error',()=>{});
        let buffer=Buffer.alloc(0);let startup=true;
        tls.on('data',data=>{
          buffer=Buffer.concat([buffer,data]);
          if(startup&&buffer.length>=4&&buffer.length>=buffer.readInt32BE(0)) {
            buffer=buffer.subarray(buffer.readInt32BE(0));startup=false;challengeCount++;tls.write(message);
          }
          while(!startup&&buffer.length>=5) {
            const size=buffer.readInt32BE(1)+1;if(buffer.length<size)break;
            if(buffer[0]===112)passwordFrames++;
            if([81,80,66,69,70].includes(buffer[0]))sqlFrames++;
            if(passwordFrames||sqlFrames)tls.end();
            buffer=buffer.subarray(size);
          }
        });
      });
    });
    server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const url=new URL(`postgresql://synthetic:synthetic@127.0.0.1:${server.address().port}/codex_prisma7_binding`);
    url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert',ca);url.searchParams.set('channel_binding','require');
    const prisma=new PrismaClient({adapter:createDatabaseAdapter(url.toString())});
    try {
      await assert.rejects(prisma.$queryRaw`SELECT 1`,/channel binding|required|SCRAM/i);
      assert.equal(passwordFrames,0);assert.equal(sqlFrames,0);
      assert.ok(challengeCount>0,"runtime must receive the authentication challenge");
      const beforeCli=challengeCount;
      const child=spawn(process.execPath,["node_modules/prisma/build/index.js","migrate","status"],{env:{...process.env,DATABASE_URL:url.toString()},stdio:["ignore","ignore","pipe"]});
      let diagnostic="";child.stderr.on("data",data=>{diagnostic+=data.toString();});
      let killed=false;const timer=setTimeout(()=>{killed=true;child.kill();},45000);
      const result=await new Promise(resolve=>child.once("exit",(code,signal)=>resolve({code,signal})));clearTimeout(timer);
      assert.equal(killed,false);assert.equal(result.signal,null);assert.equal(typeof result.code,"number");assert.notEqual(result.code,0);
      assert.ok(challengeCount>beforeCli,"CLI must receive the authentication challenge");
      assert.ok(/channel binding|required|SCRAM|Schema engine error/i.test(diagnostic),"CLI must report an authentication error");
      assert.equal(passwordFrames,0);assert.equal(sqlFrames,0);
      if(name==='cleartext'||name==='authentication without a challenge') {
        // Counterfactual control proves this fixture can observe an accepted weak authentication.
        const controlUrl=new URL(url);controlUrl.searchParams.delete('channel_binding');
        const control=new PrismaClient({adapter:createDatabaseAdapter(controlUrl.toString())});
        try {
          await assert.rejects(control.$queryRaw`SELECT 1`);
          if(name==='cleartext')assert.ok(passwordFrames>0);else assert.ok(sqlFrames>0);
        } finally {await control.$disconnect();}
      }
    } finally {
      await prisma.$disconnect();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
    }
  });
}
