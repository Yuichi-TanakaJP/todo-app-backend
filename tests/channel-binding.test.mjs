import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseConfig, prismaCliUrl } from '../dist/lib/database-config.js';
import { withPrismaParsers } from '../dist/lib/native-query-client.js';
import { inspect } from 'node:util';

test('mandatory binding survives both runtime and CLI URL normalization',()=>{
  const input='postgresql://synthetic:synthetic@db.example.invalid/db?sslmode=require&channel_binding=require';
  const config=databaseConfig(input);
  assert.equal(config.requiresChannelBinding,true);
  assert.equal(new URL(config.pool.connectionString).searchParams.get('channel_binding'),'require');
  assert.equal(new URL(prismaCliUrl(input)).searchParams.get('channel_binding'),'require');
  assert.throws(()=>databaseConfig(input.replace('channel_binding=require','channel_binding=prefer')),/mandatory/);
  assert.throws(()=>databaseConfig('postgresql://synthetic:synthetic@127.0.0.1/db?sslmode=disable&channel_binding=require'),/requires TLS/);
});
class FakeNative {
  constructor(){this.connectionParameters={nativeConnectionString:'synthetic-secret-marker'};}
  query(config,...args){
    const result={fields:[{name:'value',dataTypeID:1114}],rows:[['2026-01-02 03:04:05.123']]};
    const callback=args.find(arg=>typeof arg==='function');
    if(callback){queueMicrotask(()=>callback(null,result));return;}
    return Promise.resolve(result);
  }
}
test('native public query wrapper preserves per-query types in promise/callback modes',async()=>{
  const Client=withPrismaParsers(FakeNative);const client=new Client();
  const config={rowMode:'array',types:{getTypeParser:()=>value=>value.replace(' ','T')+'+00:00'}};
  assert.equal((await client.query(config)).rows[0][0],'2026-01-02T03:04:05.123+00:00');
  const result=await new Promise((resolve,reject)=>client.query(config,undefined,(err,result)=>err?reject(err):resolve(result)));
  assert.equal(result.rows[0][0],'2026-01-02T03:04:05.123+00:00');
  const bad={...config,types:{getTypeParser(){throw new Error('synthetic conversion failure');}}};
  await assert.rejects(client.query(bad),/synthetic conversion/);
  await assert.rejects(new Promise((resolve,reject)=>client.query(bad,(err,result)=>err?reject(err):resolve(result))),/synthetic conversion/);
  assert.equal(inspect({client},{depth:8}).includes('synthetic-secret-marker'),false);
});
test('invalid URI encoding is rejected without returning synthetic credential markers',()=>{
  for(const password of ['synthetic-marker%zz','synthetic-marker%00']) {
    assert.throws(()=>databaseConfig(`postgresql://u:${password}@db.invalid/db`),error=>/invalid encoding/.test(error.message)&&!error.message.includes('synthetic-marker'));
  }
});

test('idle adapter debug output cannot expose the native DSN',async()=>{
  const {spawnSync}=await import('node:child_process');
  const code=`import pg from 'pg'; import {PrismaPg} from '@prisma/adapter-pg';import {withPrismaParsers} from './dist/lib/native-query-client.js';import {redactNativePoolErrors} from './dist/lib/database-adapter.js';
  class Fake extends pg.Client {constructor(options){super(options);this.connectionParameters.nativeConnectionString=options.nativeConnectionString;}}
  const Client=withPrismaParsers(Fake);const settings={Client,host:'127.0.0.1',user:'synthetic',database:'synthetic',password:'synthetic',ssl:false,nativeConnectionString:'postgresql://synthetic:synthetic-marker-never-log@127.0.0.1/synthetic'};
  const pool=redactNativePoolErrors(new pg.Pool(settings));const adapter=new PrismaPg(pool,{disposeExternalPool:true});const driver=await adapter.connect();
  pool.emit('error',Object.assign(new Error('synthetic idle failure'),{client:new Client(settings)}));await driver.dispose();`;
  const env={DEBUG:'prisma:driver-adapter:pg',DEBUG_SHOW_HIDDEN:'true'};if(process.env.SystemRoot)env.SystemRoot=process.env.SystemRoot;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8'});
  assert.equal(result.status,0);assert.ok(result.stderr.includes('synthetic idle failure'));
  assert.equal(result.stderr.includes('synthetic-marker-never-log'),false);
});
