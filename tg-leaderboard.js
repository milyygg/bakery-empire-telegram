/* =====================================================================
   Булочная империя — лидерборд для Telegram (дополнительный модуль)
   ---------------------------------------------------------------------
   В Яндекс-версии лидербордов не было. Здесь они появляются «снаружи»:
   модуль сам добавляет кнопку в верхнюю панель и сам рисует окно,
   игровая логика не изменяется.

   Работает только если развёрнут worker (BACKEND_URL). Если сервера
   нет — кнопка просто не появится, ничего не сломается.

   Защита от накрутки: оценка принимается только вместе с initData
   Telegram, которую worker проверяет HMAC-подписью на своей стороне.
   ===================================================================== */
(function () {
  'use strict';

  var api = window.BAKERY_API;
  var tg = null;
  try { tg = window.Telegram && window.Telegram.WebApp; } catch (e) { tg = null; }
  var isTG = !!(tg && tg.initData);

  if (!api || !api.backend() || !isTG) return;   /* нет сервера — модуль молчит */

  /* ---------------- стили ---------------- */
  var css = document.createElement('style');
  css.id = 'tg-leaderboard-css';
  css.textContent = [
    '#tgleader-btn{position:relative;display:flex;align-items:center;gap:6px}',
    '#tgleader-btn .di{width:26px;height:26px}',
    '@media(max-width:520px){#tgleader-btn .di{width:22px;height:22px}}',
    '#tgleader-overlay{position:fixed;inset:0;z-index:9998;display:none;',
    '  background:#120705cc;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
    '  padding:calc(env(safe-area-inset-top) + 16px) 12px calc(env(safe-area-inset-bottom) + 16px);',
    '  overflow:auto}',
    '#tgleader-overlay.open{display:block}',
    '#tgleader-card{max-width:460px;margin:0 auto;background:#2a1428f2;border:1px solid #ffffff2e;',
    '  border-radius:22px;padding:16px 14px 18px;color:#fff8ec;',
    '  font-family:"Arial Rounded MT Bold","Trebuchet MS",Arial,sans-serif;font-weight:700;',
    '  box-shadow:0 18px 50px #000a}',
    '#tgleader-card h3{margin:0 0 4px;font-size:20px;color:#ffd166;text-align:center;',
    '  text-shadow:0 2px 0 #7a4a10}',
    '#tgleader-sub{margin:0 0 12px;font-size:12px;color:#e8cdb8;text-align:center;font-weight:400}',
    '.tgleader-tabs{display:flex;gap:6px;margin-bottom:10px}',
    '.tgleader-tabs button{flex:1;padding:8px 4px;border-radius:12px;border:1px solid #ffffff2e;',
    '  background:#ffffff12;color:#e8cdb8;font-size:12px;font-weight:700;cursor:pointer}',
    '.tgleader-tabs button.on{background:#ffd16622;color:#ffd166;border-color:#ffd16655}',
    '.tgleader-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:12px;',
    '  font-size:13px;margin-bottom:3px;background:#ffffff0a}',
    '.tgleader-row.me{background:#ffd1661f;border:1px solid #ffd16644}',
    '.tgleader-rank{width:26px;text-align:center;color:#8fe3c0;font-size:14px;flex:0 0 auto}',
    '.tgleader-row:nth-child(2) .tgleader-rank{color:#ffd166}',
    '.tgleader-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.tgleader-score{flex:0 0 auto;color:#ffd166;font-variant-numeric:tabular-nums}',
    '.tgleader-medal{font-size:16px}',
    '#tgleader-close{display:block;width:100%;margin-top:12px;padding:11px;border-radius:14px;',
    '  border:1px solid #ffffff33;background:#ff8fb82e;color:#fff8ec;font-size:15px;',
    '  font-weight:700;cursor:pointer}',
    '#tgleader-empty{text-align:center;color:#e8cdb8;font-size:13px;padding:18px 0;font-weight:400}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------------- кнопка в верхней панели ---------------- */
  function addButton() {
    var host = document.getElementById('top-actions');
    if (!host || document.getElementById('tgleader-btn')) return;
    var b = document.createElement('button');
    b.id = 'tgleader-btn';
    b.className = 'ui';
    b.type = 'button';
    b.title = 'Рейтинг пекарей';
    b.setAttribute('aria-label', 'Рейтинг пекарей');
    b.innerHTML = '<svg class="di" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="currentColor" d="M5 4h14v2a5 5 0 0 1-4 4.9V13h2.5a1.5 1.5 0 0 1 1.5 1.5V17h-14v-2.5A1.5 ' +
      '1.5 0 0 1 6.5 13H9v-2.1A5 5 0 0 1 5 6zM3 5v1a3 3 0 0 0 2 2.83V6.1A1 1 0 0 1 4 5.1zm18 0v1a1 1 0 0 ' +
      '1-1 1v1.73A3 3 0 0 0 21 6zM7 18h10v2H7z"/></svg>';
    b.addEventListener('click', function () { open(); });
    /* ставим перед «Заданиями», чтобы не ломать правый край */
    host.insertBefore(b, host.firstChild);
  }

  /* ---------------- окно ---------------- */
  function buildOverlay() {
    if (document.getElementById('tgleader-overlay')) return;
    var o = document.createElement('div');
    o.id = 'tgleader-overlay';
    o.innerHTML =
      '<div id="tgleader-card">' +
      '  <h3>🏆 Рейтинг пекарей</h3>' +
      '  <p id="tgleader-sub">Кто испёк больше всех за всё время</p>' +
      '  <div class="tgleader-tabs">' +
      '    <button type="button" data-p="all" class="on">За всё время</button>' +
      '    <button type="button" data-p="week">За неделю</button>' +
      '  </div>' +
      '  <div id="tgleader-list"><div id="tgleader-empty">Загрузка…</div></div>' +
      '  <button type="button" id="tgleader-close">Закрыть</button>' +
      '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) close(); });
    document.getElementById('tgleader-close').addEventListener('click', close);
    o.querySelectorAll('.tgleader-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        o.querySelectorAll('.tgleader-tabs button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        load(b.dataset.p);
      });
    });
  }

  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmt(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n < 1e6) return n.toLocaleString('ru-RU');
    var s = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
    var e = Math.min(Math.floor(Math.log10(n) / 3), s.length);
    return Math.floor(n / Math.pow(10, e * 3)) + s[e - 1];
  }

  var period = 'all';
  var MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function render(rows, myRow) {
    var box = document.getElementById('tgleader-list');
    if (!box) return;
    if (!rows || !rows.length) {
      box.innerHTML = '<div id="tgleader-empty">Пока пусто — стань первым! 🥐</div>';
      return;
    }
    var html = rows.map(function (r, i) {
      var pos = i + 1;
      var me = myRow && String(myRow.id) === String(r.id);
      return '<div class="tgleader-row' + (me ? ' me' : '') + '">' +
        '<span class="tgleader-rank">' + (MEDALS[pos] || pos) + '</span>' +
        '<span class="tgleader-name">' + (me ? '⭐ ' : '') + esc(r.name || 'Пекарь') + '</span>' +
        '<span class="tgleader-score">' + fmt(r.score) + '</span>' +
        '</div>';
    }).join('');
    if (myRow && myRow.rank > rows.length) {
      html += '<div class="tgleader-row me" style="margin-top:8px">' +
        '<span class="tgleader-rank">' + myRow.rank + '</span>' +
        '<span class="tgleader-name">⭐ ' + esc(myRow.name || 'Ты') + '</span>' +
        '<span class="tgleader-score">' + fmt(myRow.score) + '</span></div>';
    }
    box.innerHTML = html;
  }

  function load(p) {
    period = p || 'all';
    var sub = document.getElementById('tgleader-sub');
    if (sub) sub.textContent = period === 'week' ? 'Лучшие за последние 7 дней' : 'Кто испёк больше всех за всё время';
    var box = document.getElementById('tgleader-list');
    if (box) box.innerHTML = '<div id="tgleader-empty">Загрузка…</div>';
    api.post('/api/top', { period: period, limit: 50 }).then(function (r) {
      if (!r || !r.ok) { if (box) box.innerHTML = '<div id="tgleader-empty">Рейтинг недоступен</div>'; return; }
      render(r.top || [], r.me || null);
    }).catch(function () {
      if (box) box.innerHTML = '<div id="tgleader-empty">Рейтинг недоступен</div>';
    });
  }

  function open() {
    buildOverlay();
    var o = document.getElementById('tgleader-overlay');
    if (o) o.classList.add('open');
    load(period);
    try { if (window.v26PauseGame) window.v26PauseGame(); } catch (e) {}
  }
  function close() {
    var o = document.getElementById('tgleader-overlay');
    if (o) o.classList.remove('open');
    try { if (window.v26ResumeGame) window.v26ResumeGame(); } catch (e) {}
  }
  window.BAKERY_LEADERBOARD = { open: open, close: close, submit: submit };

  /* ---------------- отправка своего результата ---------------- */
  var lastSubmit = 0;
  function submit(force) {
    try {
      if (typeof S === 'undefined' || !S) return;
      var now = Date.now();
      if (!force && now - lastSubmit < 45000) return;
      lastSubmit = now;
      var score = Math.floor(Number(S.total) || 0);
      var week = Math.floor(Number(S.run) || 0);
      if (score <= 0) return;
      api.post('/api/score', { score: score, week: week, v: (document.querySelector('meta[name=bakery-version]') || {}).content || '' })
        .catch(function () {});
    } catch (e) {}
  }

  /* ---------------- инициализация ---------------- */
  var tries = 0;
  var t = setInterval(function () {
    if (document.getElementById('top-actions')) {
      clearInterval(t);
      addButton();
      submit(false);
    } else if (++tries > 60) clearInterval(t);
  }, 300);

  setInterval(function () { submit(false); }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) submit(true); });
  window.addEventListener('pagehide', function () { submit(true); });
})();
