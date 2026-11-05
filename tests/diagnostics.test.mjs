import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('staging metadata refreshes instead of retaining first revision',async()=>{let box,rev=0;const timers=[];const tg={WebApp:{initData:'fixture'}};const context={document:{createElement:()=>box={style:{},append(){}},body:{append(){}}},window:{Telegram:tg},Telegram:tg,AbortSignal,setInterval:(fn,ms)=>timers.push({fn,ms}),fetch:async()=>({ok:true,status:200,json:async()=>({revision:rev,exists:rev>0})})};vm.runInNewContext(fs.readFileSync(new URL('../staging/diagnostics.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));assert.match(box.textContent,/revision=0/);rev=4;await timers.find(t=>t.ms===30000).fn();assert.match(box.textContent,/revision=4 запись=есть/);assert.ok(!box.textContent.includes('fixture'));});
