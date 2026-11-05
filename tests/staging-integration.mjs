import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base = 'https://bakery-empire-staging.miloserdovfeed.workers.dev';
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => nativeFetch(url, {...options, signal:AbortSignal.timeout(20000)});
const sql = command => {
  const result = execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','bakery-empire-staging-db','--remote','--config','staging/wrangler.jsonc','--command',command,'--json'], {encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  return JSON.parse(result)[0];
};
const a='qa-'+crypto.randomUUID(), b='qa-'+crypto.randomUUID();
try {
  const data=JSON.stringify({coins:0,total:50,resets:1,last:1,clicks:5,own:Array(12).fill(0)});
  sql(`INSERT INTO player_saves(telegram_id,save_data,revision) VALUES ('${a}','${data}',1)`);
  assert.equal(JSON.parse(sql(`SELECT save_data FROM player_saves WHERE telegram_id='${a}'`).results[0].save_data).resets,1);
  assert.equal(sql(`SELECT revision FROM player_saves WHERE telegram_id='${b}'`).results.length,0);
  const [one,two] = await Promise.all([1,2].map(async()=>sql(`UPDATE player_saves SET revision=revision+1 WHERE telegram_id='${a}' AND revision=1`)));
  assert.deepEqual([one.meta.changes,two.meta.changes].sort(),[0,1]);
  assert.equal(sql(`SELECT revision FROM player_saves WHERE telegram_id='${a}'`).results[0].revision,2);
  console.log('PASS remote D1: write/read, isolated rows, stale revision rejected. SQL calls, not authenticated API.');
} finally { sql(`DELETE FROM player_saves WHERE telegram_id IN ('${a}','${b}')`); }
for(const [url,options,status] of [
  ['/api/save',{},401],
  ['/api/save',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'},401],
  ['/api/save',{headers:{Authorization:'tma user=%7B%22id%22%3A123%7D&auth_date=1&signature=fake'}},401],
  ['/api/save',{headers:{Origin:'https://example.com'}},403],
  ['/webhook',{method:'POST'},404],
  ['/api/invoice',{method:'POST'},404]
]) {assert.equal((await fetch(base+url,options)).status,status);}
const html=await (await fetch(base)).text();
assert.ok(html.includes('STAGING'));
const script=await (await fetch(base+'/cloud-saves.js')).text();
assert.ok(script.includes(base+'/api/save'));
assert.ok(!script.includes('https://bakery-empire-bot.'));
assert.ok((await (await fetch(base+'/tg-adapter.js')).text()).includes('function cs() { return null; }'));
console.log('PASS deployed HTTP: unauthenticated/forged requests rejected, webhook/payments absent, staging frontend isolated.');
