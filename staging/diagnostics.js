(function(){
const box=document.createElement('div');box.style.cssText='position:fixed!important;top:78px!important;left:8px!important;z-index:2147483646!important;background:white!important;color:black!important;padding:10px!important;font:14px sans-serif!important;max-width:90vw!important';document.body.append(box);
const tg=window.Telegram&&Telegram.WebApp;
let auth='ожидание';
function draw(){box.textContent='STAGING: Telegram '+(tg&&tg.initData?'данные есть':'нет данных запуска')+'; API: '+auth+'; облако: '+(window.BAKERY_CLOUD&&BAKERY_CLOUD.status?BAKERY_CLOUD.status():'модуль не запущен');}
draw();setInterval(draw,1000);
async function refresh(){if(tg&&tg.initData) return fetch('/api/save',{headers:{Authorization:'tma '+tg.initData},signal:AbortSignal.timeout(15000)}).then(async r=>{const d=await r.json();auth=r.status+(r.ok?' revision='+d.revision+' запись='+(d.exists?'есть':'нет'):' '+(d.error||''));draw();}).catch(()=>{auth='сетевая ошибка';draw()});}
refresh();setInterval(refresh,30000);
})();
