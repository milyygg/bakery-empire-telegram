
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../server/worker.mjs';
const token='local-fixture-only';
function auth(id=1){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id}),signature:'fixture'});const s=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update(s).digest('hex'));return 'tma '+p;}
function req(method,authorization,body){return new Request('https://example.test/api/save',{method,headers:{Authorization:authorization,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});}
test('signed identity only, signature authenticated, invalid schema blocked',async()=>{
let ids=[];const env={BOT_TOKEN:token,DB:{prepare:()=>({bind:id=>{ids.push(id);return {first:async()=>null}}})}};
assert.equal((await worker.fetch(req('GET',auth(123)),env)).status,200);assert.deepEqual(ids,['123']);
assert.equal((await worker.fetch(req('GET',auth().replace('fixture','tampered')),env)).status,401);
assert.equal((await worker.fetch(req('GET','tma user=123'),env)).status,401);
assert.equal((await worker.fetch(req('PUT',auth(),{revision:0,data:{coins:1}}),env)).status,400);
});
test('webhook rejects missing secret, private fallback offers game',async()=>{
assert.equal((await worker.fetch(new Request('https://example.test/webhook',{method:'POST'}),{BOT_TOKEN:token,WEBHOOK_SECRET:'local'})).status,403);
const old=globalThis.fetch;let sent;globalThis.fetch=async(u,o)=>{sent=JSON.parse(o.body);return new Response('{}')};try{
const r=await worker.fetch(new Request('https://example.test/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'local'},body:JSON.stringify({update_id:1,message:{chat:{id:1,type:'private'},text:'Привет'}})}),{BOT_TOKEN:token,WEBHOOK_SECRET:'local'});assert.equal(r.status,200);assert.match(sent.text,/начать игру/);assert.ok(sent.reply_markup.inline_keyboard);
}finally{globalThis.fetch=old}
});

test('atomic revision conflict and separate user records', async()=>{
 const rows=new Map();
 const DB={prepare(sql){return {bind(...v){return {
 async first(){const r=rows.get(v[0]);return r?{save_data:r.data,revision:r.rev}:null},
 async run(){if(sql.startsWith('INSERT')){if(rows.has(v[0]))return {meta:{changes:0}};rows.set(v[0],{data:v[1],rev:1});return {meta:{changes:1}}}
 const r=rows.get(v[1]);if(!r||r.rev!==v[2])return {meta:{changes:0}};rows.set(v[1],{data:v[0],rev:r.rev+1});return {meta:{changes:1}}}
 }}}}};
 const env={BOT_TOKEN:token,DB},data={own:Array(12).fill(0),coins:0,total:0,resets:1,last:Date.now(),clicks:2};
 const send=()=>worker.fetch(req('PUT',auth(7),{revision:0,data}),env);
 const result=await Promise.all([send(),send()]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 const other=await (await worker.fetch(req('GET',auth(8)),env)).json();assert.equal(other.exists,false);
 const restored=await (await worker.fetch(req('GET',auth(7)),env)).json();assert.equal(restored.data.resets,1);assert.equal(restored.data.coins,0);
});
