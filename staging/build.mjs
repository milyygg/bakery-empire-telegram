import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..');
const dir = import.meta.dirname;
const origin = 'https://bakery-empire-staging.miloserdovfeed.workers.dev';
let worker = fs.readFileSync(path.join(root,'server/worker.mjs'),'utf8').replaceAll('\r\n','\n');
worker = worker.replace('https://milyygg.github.io',origin);
const start = worker.indexOf('async function authenticate(');
const end = worker.indexOf('async function handleSave(',start);
worker = worker.slice(0,start) + `async function authenticate(request, botId) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('tma ') || header.length > 8196 || !/^[1-9][0-9]*$/.test(botId || '')) return null;
  try {
    const p = new URLSearchParams(header.slice(4));
    const entries = [...p.entries()];
    if (new Set(entries.map(([k]) => k)).size !== entries.length) return null;
    const date = Number(p.get('auth_date')), now = Math.floor(Date.now()/1000);
    if (!Number.isSafeInteger(date) || date > now+60 || now-date > MAX_AUTH_AGE_SECONDS) return null;
    const signature = p.get('signature') || '';
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(signature)) return null;
    const bytes = Uint8Array.from(atob(signature.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(signature.length/4)*4,'=')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', Uint8Array.from('e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d'.match(/../g), x => parseInt(x,16)), {name:'Ed25519'}, false, ['verify']);
    const data = botId + ':WebAppData\\n' + entries.filter(([k]) => k !== 'hash' && k !== 'signature').sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => k+'='+v).join('\\n');
    if (!await crypto.subtle.verify('Ed25519',key,bytes,encoder.encode(data))) return null;
    const user = JSON.parse(p.get('user'));
    return Number.isSafeInteger(user?.id) && user.id > 0 ? String(user.id) : null;
  } catch { return null; }
}

` + worker.slice(end);
worker = worker.replace('!env.BOT_TOKEN || !env.DB','!env.DB').replace('request,\n    env.BOT_TOKEN','request,\n    env.BOT_ID');
worker = worker.replace('if (request.method === "GET") {', `if (!(env.TEST_USER_IDS || '').split(',').includes(telegramId)) return json({error:'Test account not allowed'},403,origin);\n  if (request.method === "GET") {`);
const webhookStart = worker.indexOf('    if (url.pathname === "/webhook")');
const apiStart = worker.indexOf('    if (url.pathname === "/api/save")',webhookStart);
worker = worker.slice(0,webhookStart) + `    if (url.pathname === '/webhook') return new Response('Not found',{status:404});\n` + worker.slice(apiStart);
worker = worker.replace('return new Response(\n      "Bakery Empire Bot is running",\n      { status: 200 }\n    );', `if (url.pathname.startsWith('/api/')) return json({error:'Not found'},404);\n    return env.ASSETS.fetch(request);`);
fs.writeFileSync(path.join(dir,'worker.mjs'),worker);
fs.mkdirSync(path.join(dir,'public'),{recursive:true});
for (const file of ['index.html','tg-adapter.js','tg-leaderboard.js','cloud-saves.js']) {
  let s = fs.readFileSync(path.join(root,file),'utf8');
  s = s.replaceAll('https://bakery-empire-bot.miloserdovfeed.workers.dev/api/save',origin+'/api/save');
  // Never touch Telegram CloudStorage shared with the live game.
  if (file === 'tg-adapter.js') s = s.replace('return isTG && tg.CloudStorage ? tg.CloudStorage : null;', 'return null;');
  if (file === 'index.html') s = s.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">').replace('<body>', '<body><div style="position:fixed;top:0;left:0;z-index:99999;background:#a30;color:white;padding:4px">STAGING - отдельные тестовые сохранения</div>');
  if(file === 'index.html') s=s.replace('</body>', '<script>addEventListener("DOMContentLoaded",()=>{const d=document.createElement("div");d.style.cssText="position:fixed;top:40px;left:8px;z-index:100001;background:white;color:black;padding:8px";d.textContent="STAGING user.id (не проверен сервером): "+(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "откройте через Telegram");d.onclick=()=>d.remove();document.body.append(d)});</script></body>');
  if(file === 'index.html') s=s.replace('./cloud-saves.js','./cloud-saves.js?v=diag2').replace('./tg-adapter.js','./tg-adapter.js?v=diag2').replace('</body>', '<script src="./diagnostics.js?v=2"></script></body>');
  fs.writeFileSync(path.join(dir,'public',file),s);
}
console.log('Staging built; no production files changed.');

fs.copyFileSync(path.join(dir,'diagnostics.js'),path.join(dir,'public/diagnostics.js'));
