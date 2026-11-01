import pg from 'pg';
import { spawnSync } from 'node:child_process';
if(process.platform==='linux' && process.env.RENDER) {
  try {
    if(!pg.native?.Client)throw new Error('native missing');
    const result=spawnSync('pg_config',['--version'],{encoding:'utf8'});
    const major=Number(result.stdout?.match(/PostgreSQL (\d+)/)?.[1]);
    if(result.status!==0 || major<13 || !Number.isFinite(major))throw new Error('libpq prerequisite');
    console.log('Mandatory channel binding native prerequisites: PASS');
  } catch {
    throw new Error('Render requires pg-native and libpq >=13. Build stopped before deployment; no JavaScript authentication fallback.');
  }
}
