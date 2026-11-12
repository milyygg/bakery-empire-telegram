import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const hex=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
// Test-only replacement in memory. Deployed code retains Telegram's public key.
const source=fs.readFileSync(new URL('../staging/worker.mjs',import.meta.url),'utf8').replace('e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',hex);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function auth(bot='9268949608',id=549862623){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id}),query_id:'fixture'});const data=bot+':WebAppData\n'+[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');p.set('signature',sign(null,Buffer.from(data),privateKey).toString('base64url'));return 'tma '+p;}
test('generated staging verifier: correct bot, signed user, allowlist, wrong bot and tampering',async()=>{let lookup;const env={BOT_ID:'9268949608',TEST_USER_IDS:'549862623',DB:{prepare(){return {bind(id){lookup=id;return {first:async()=>null}}}}}};const request=a=>new Request('https://example.test/api/save',{headers:{Authorization:a}});assert.equal((await worker.fetch(request(auth()),env)).status,200);assert.equal(lookup,'549862623');assert.equal((await worker.fetch(request(auth('549862623')),env)).status,401);assert.equal((await worker.fetch(request(auth('9268949608',123)),env)).status,403);assert.equal((await worker.fetch(request(auth().replace('fixture','changed')),env)).status,401);});
