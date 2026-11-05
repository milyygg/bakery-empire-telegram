(function(){
const panel=document.createElement('details');const title=document.createElement('summary');title.textContent='STAGING';panel.append(title);const box=document.createElement('div');panel.append(box);panel.style.cssText='position:fixed;bottom:8px;left:8px;z-index:2147483646;background:#fff;color:#222;max-width:85vw;padding:6px;font:12px sans-serif';document.body.append(panel);box.style.cssText='padding:8px;max-width:320px;overflow-wrap:anywhere';
const tg=window.Telegram&&Telegram.WebApp;
let auth='ожидание';
function draw(){box.textContent='STAGING: Telegram '+(tg&&tg.initData?'данные есть':'нет данных запуска')+'; API: '+auth+'; облако: '+(window.BAKERY_CLOUD&&BAKERY_CLOUD.status?BAKERY_CLOUD.status():'модуль не запущен');}
draw();setInterval(draw,1000);
async function refresh(){if(tg&&tg.initData) return fetch('/api/save',{headers:{Authorization:'tma '+tg.initData},signal:AbortSignal.timeout(15000)}).then(async r=>{const d=await r.json();auth=r.status+(r.ok?' revision='+d.revision+' запись='+(d.exists?'есть':'нет'):' '+(d.error||''));draw();}).catch(()=>{auth='сетевая ошибка';draw()});}
refresh();setInterval(refresh,30000);
})();
