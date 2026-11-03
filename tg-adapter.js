/* =====================================================================
   Булочная империя — адаптер под Telegram Mini Apps
   ---------------------------------------------------------------------
   Подключается ОТДЕЛЬНЫМ файлом, игровую логику не трогает.
   Отвечает за:
     1. Определение платформы (Telegram / Яндекс / обычный браузер)
     2. Поведение WebView: полный экран, свайпы, кнопка «Назад», тема
     3. Облачные сейвы: эмуляция player.getData/setData поверх
        Telegram CloudStorage (с разбивкой на чанки по 4096 символов)
        + зеркало на свой бэкенд (worker)
     4. Тактильный отклик (HapticFeedback)
   Платежи Stars и rewarded-реклама — в секциях 1 и 3 блока v26-platform
   внутри index.html (они переписаны сборщиком build.py).
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 0. КОНФИГУРАЦИЯ ----------------
     BACKEND_URL — адрес Cloudflare Worker.
     Оставь пустой строкой, если сервер не развёрнут:
     игра будет работать только на CloudStorage + localStorage. */
  var CFG = window.BAKERY_TG_CONFIG || {};
  var BACKEND = String(CFG.backend || '').replace(/\/+$/, '');
  window.BAKERY_PLATFORM = 'browser';

  var tg = null;
  try { tg = window.Telegram && window.Telegram.WebApp; } catch (e) { tg = null; }
  var isTG = !!(tg && tg.initData && tg.platform !== 'web');

  /* Яндекс-режим: если SDK Яндекса реально инициализировался — не мешаем ему */
  var isYandex = (function () {
    try { return typeof YaGames !== 'undefined'; } catch (e) { return false; }
  })();

  window.BAKERY_PLATFORM = isTG ? 'telegram' : (isYandex ? 'yandex' : 'browser');
  window.BAKERY_BACKEND = BACKEND;

  /* ---------------- утилиты ---------------- */
  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
  function say(t) { try { if (typeof toast === 'function') toast(t); } catch (e) {} }
  function post(path, body) {
    if (!BACKEND) return Promise.reject(new Error('no-backend'));
    var payload = body || {};
    payload.initData = tg && tg.initData ? tg.initData : '';
    return fetch(BACKEND + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false }; });
    });
  }
  window.BAKERY_API = { post: post, backend: function () { return BACKEND; } };

  /* =========================================================
     1. ПОВЕДЕНИЕ WEBVIEW TELEGRAM
     ========================================================= */
  function setupWebView() {
    if (!isTG) return;

    safe(function () { tg.ready(); });

    /* Полный экран — иначе игра занимает часть окна */
    safe(function () { tg.expand(); });

    /* ВАЖНО: свайп вниз закрывает Mini App. В кликере игрок постоянно
       тянет пальцем по экрану — без этого игра будет закрываться сама. */
    safe(function () {
      if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
    });

    /* Портретная ориентация (игра сверстана под портрет) */
    safe(function () {
      if (typeof tg.lockOrientation === 'function') tg.lockOrientation();
    });
    safe(function () {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () {});
    });

    /* Цвет шапки и фона под палитру игры */
    safe(function () { if (tg.setHeaderColor) tg.setHeaderColor('#2b1a14'); });
    safe(function () { if (tg.setBackgroundColor) tg.setBackgroundColor('#1a0d0b'); });

    /* Подсказка «Добавить на главный экран» — удобно для постоянного игрока */
    safe(function () {
      if (typeof tg.addToHomeScreen === 'function' && typeof tg.isAddedToHomeScreen === 'boolean') {
        if (!tg.isAddedToHomeScreen) setTimeout(function () { safe(function () { tg.addToHomeScreen(); }); }, 45000);
      }
    });

    /* Аппаратная кнопка «Назад» Android: сначала закрываем свои модалки,
       и только потом выходим из игры */
    safe(function () {
      var bb = tg.BackButton;
      if (!bb) return;
      var handler = function () {
        /* 1. открытая шторка меню — закрываем её */
        var sheet = document.getElementById('sheet');
        if (sheet && sheet.classList.contains('open')) {
          sheet.classList.remove('open');
          document.body.classList.remove('v25-sheet-open');
          bb.hide();
          return;
        }
        /* 2. открытый диалог/модалка игры */
        var modal = document.querySelector('.modal.open, .dialog.open, #dialog.open');
        if (modal) {
          safe(function () { if (typeof closeDialog === 'function') closeDialog(); else modal.classList.remove('open'); });
          bb.hide();
          return;
        }
        /* 3. иначе — выход */
        safe(function () { if (typeof save === 'function') save(); });
        safe(function () { tg.close(); });
      };
      bb.onClick(handler);
      bb.show();
      /* Прячем, когда ничего закрывать не нужно — чтобы не мешала */
      setInterval(function () {
        var sheet = document.getElementById('sheet');
        var modal = document.querySelector('.modal.open, .dialog.open, #dialog.open');
        var needed = !!(sheet && sheet.classList.contains('open')) || !!modal;
        safe(function () { needed ? bb.show() : bb.hide(); });
      }, 800);
    });

    /* Сохраняемся перед закрытием. Telegram может убить WebView в любой
       момент, поэтому здесь именно принудительный flush, без троттлинга. */
    var flushNow = function () {
      safe(function () { if (typeof save === 'function') save(); });
      try {
        var cur = window.eval('typeof S!=="undefined"?S:null');
        if (cur && window.BAKERY_CLOUD) window.BAKERY_CLOUD.flush(cur);
      } catch (e) {}
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushNow(); });
  }

  /* =========================================================
     2. ТЕМА TELEGRAM -> CSS-переменные игры
     ========================================================= */
  function applyTheme() {
    if (!isTG) return;
    var p = safe(function () { return tg.themeParams; }, null);
    if (!p) return;
    var root = document.documentElement;
    /* Меняем только нейтральные цвета, игровую палитру не ломаем */
    if (p.backgroundColor) safe(function () { root.style.setProperty('--tg-bg', p.backgroundColor); });
    if (p.textColor) safe(function () { root.style.setProperty('--tg-text', p.textColor); });
    document.documentElement.setAttribute('data-tg-theme', String(tg.colorScheme || 'dark'));
  }

  /* =========================================================
     3. ТАКТИЛЬНЫЙ ОТКЛИК
     ========================================================= */
  function setupHaptics() {
    if (!isTG) return;
    var hf = safe(function () { return tg.HapticFeedback; }, null);
    if (!hf) return;

    var lastImpact = 0;
    document.addEventListener('pointerdown', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('button, .bake, .tap, .buy, [onclick]') : null;
      if (!el) return;
      var now = Date.now();
      if (now - lastImpact < 45) return;   /* защита от «пулемёта» */
      lastImpact = now;
      safe(function () { hf.impactOccurred('light'); });
    }, { passive: true, capture: true });

    /* Сильный отклик на крупные события игры */
    window.BAKERY_HAPTIC = function (kind) {
      safe(function () { hf.impactOccurred(kind === 'success' ? 'medium' : 'heavy'); });
    };
    window.addEventListener('bakery:reward', function () { window.BAKERY_HAPTIC('success'); });
  }

  /* =========================================================
     4. ОБЛАЧНЫЕ СЕЙВЫ
     ---------------------------------------------------------
     Telegram CloudStorage: до 1024 ключей, значение — НЕ БОЛЕЕ
     4096 символов. Поздний сейв «Булочной империи» (12 зданий,
     44 ветки апгрейдов, 60 наград пропуска, достижения, скины,
     пулы 24+25) в этот лимит не влезает, поэтому:
       - бьём JSON на чанки: bakery_S_0, bakery_S_1, ...
       - параллельно кладём полный сейв на свой бэкенд (если есть)
     Ядро игры при этом трогать не нужно: оно уже умеет работать
     с объектом вида player.getData(['S']) / player.setData({S}),
     поэтому мы просто подставляем свой «player».
     ========================================================= */
  var CHUNK = 3800;              /* с запасом до 4096 */
  var PREFIX = 'bakery_S_';
  var META = 'bakery_S_meta';
  var backendUserHash = '';      /* придёт с бэкенда после валидации initData */
  var lastBackendPush = 0;

  function cs() { return isTG && tg.CloudStorage ? tg.CloudStorage : null; }

  function csSet(key, value) {
    return new Promise(function (resolve, reject) {
      var s = cs();
      if (!s) return reject(new Error('no-cloudstorage'));
      s.setItem(key, value, function (err, ok) { err ? reject(err) : resolve(ok); });
    });
  }
  function csGet(key) {
    return new Promise(function (resolve, reject) {
      var s = cs();
      if (!s) return reject(new Error('no-cloudstorage'));
      s.getItem(key, function (err, val) { err ? reject(err) : resolve(val); });
    });
  }
  function csRemove(key) {
    return new Promise(function (resolve) {
      var s = cs();
      if (!s) return resolve(false);
      s.removeItem(key, function () { resolve(true); });
    });
  }

  function splitChunks(json) {
    var out = [];
    for (var i = 0; i < json.length; i += CHUNK) out.push(json.slice(i, i + CHUNK));
    return out.length ? out : [''];
  }

  function writeCloud(S) {
    var json = JSON.stringify({ S: S });
    var parts = splitChunks(json);
    var chain = csSet(META, String(parts.length));
    parts.forEach(function (p, i) { chain = chain.then(function () { return csSet(PREFIX + i, p); }); });
    /* подчищаем хвосты от старого, более длинного сейва */
    chain = chain.then(function () {
      return new Promise(function (res) {
        var s = cs(); if (!s) return res();
        s.getKeys(function (err, keys) {
          if (err || !keys) return res();
          var stale = keys.filter(function (k) {
            return k.indexOf(PREFIX) === 0 && Number(k.slice(PREFIX.length)) >= parts.length;
          });
          var c = Promise.resolve();
          stale.forEach(function (k) { c = c.then(function () { return csRemove(k); }); });
          c.then(res, res);
        });
      });
    });
    return chain.catch(function () {});
  }

  function readCloud() {
    return csGet(META).then(function (meta) {
      var n = parseInt(meta, 10);
      if (!isFinite(n) || n < 1) throw new Error('empty');
      if (n > 200) throw new Error('bad-meta');
      var keys = [];
      for (var i = 0; i < n; i++) keys.push(PREFIX + i);
      return new Promise(function (resolve, reject) {
        var s = cs();
        if (!s) return reject(new Error('no-cloudstorage'));
        s.getItems(keys, function (err, vals) {
          if (err) return reject(err);
          var arr = Array.isArray(vals) ? vals : keys.map(function (k) { return vals[k]; });
          if (arr.some(function (v) { return v == null; })) return reject(new Error('incomplete'));
          resolve(JSON.parse(arr.join('')));
        });
      });
    });
  }

  /* ---- бэкенд-сейв (полный, без лимитов) ----
     force=true обходит троттлинг — нужно для явного «сохранить сейчас»
     и для выхода из игры. */
  function pushBackend(S, force) {
    if (!BACKEND || !isTG) return Promise.resolve(null);
    var now = Date.now();
    if (!force && now - lastBackendPush < 20000) return Promise.resolve(null); /* троттлинг */
    lastBackendPush = now;
    var body = { S: S };
    if (backendUserHash) body.userHash = backendUserHash;
    return post('/api/save', body).then(function (r) {
      if (r && r.ok && r.userHash && !backendUserHash) backendUserHash = r.userHash;
      return r;
    }).catch(function () { return null; });
  }

  function pullBackend() {
    if (!BACKEND || !isTG) return Promise.resolve(null);
    return post('/api/load', {}).then(function (r) {
      if (r && r.ok) {
        if (r.userHash) backendUserHash = r.userHash;
        return r.S || null;
      }
      return null;
    }).catch(function () { return null; });
  }

  /* «player» — заглушка в форме Яндекс-плеера, которую ждёт ядро игры.
     Ядро объявляет `player` через let в глобальной области скрипта, поэтому
     назначает его САМ (в index.html, блок инициализации) — адаптер лишь
     отдаёт готовый объект через window.BAKERY_CLOUD.makePlayer(). */
  function makePlayer() {
    return {
      setData: function (data) {
        var S = data && data.S;
        if (!S) return Promise.resolve();
        var a = writeCloud(S);
        var b = pushBackend(S);
        return Promise.all([a, b]).then(function () {});
      },
      /* явное сохранение без троттлинга (кнопка «Сохранить», выход из игры) */
      flush: function (data) {
        var S = data && data.S;
        if (!S) return Promise.resolve();
        return Promise.all([writeCloud(S), pushBackend(S, true)]).then(function () {});
      },
      getData: function () { return loadSave(); }
    };
  }

  /* Читает оба источника и выбирает более «продвинутый» сейв —
     та же логика сравнения, что уже есть в ядре игры. */
  function loadSave() {
    return Promise.all([
      readCloud().catch(function () { return null; }),
      pullBackend()
    ]).then(function (res) {
      var c = res[0] && res[0].S ? res[0].S : null;
      var b = res[1];
      if (c && b) {
        var score = function (x) { return (Number(x.total) || 0) + (Number(x.last) || 0) / 1e6; };
        return { S: score(b) >= score(c) ? b : c };
      }
      if (b) return { S: b };
      if (c) return { S: c };
      return null;
    });
  }

  /* Публичный API адаптера — доступен синхронно, ещё до DOMContentLoaded,
     чтобы ядро игры могло позвать его в своей инициализации. */
  window.BAKERY_CLOUD = {
    available: function () { return isTG && (!!cs() || !!BACKEND); },
    isTelegram: function () { return isTG; },
    makePlayer: makePlayer,
    loadSave: loadSave,
    saveNow: function (S, force) {
      if (!S) return Promise.resolve();
      return Promise.all([
        isTG ? writeCloud(S) : Promise.resolve(),
        pushBackend(S, force)
      ]).then(function () {});
    },
    /* Принудительная синхронизация: зовётся при уходе со страницы,
       чтобы прогресс не потерялся между автосохранениями. */
    flush: function (S) {
      if (!S || !isTG) return Promise.resolve();
      return Promise.all([writeCloud(S), pushBackend(S, true)]).then(function () {});
    }
  };

  /* =========================================================
     5. СТАРТ
     ========================================================= */
  function boot() {
    applyTheme();
    setupWebView();
    setupHaptics();

    /* Если сервер есть — сразу спрашиваем у него userHash,
       чтобы последующие сохранения подписывались им */
    if (BACKEND && isTG) {
      post('/api/me', {}).then(function (r) {
        if (r && r.ok && r.userHash) backendUserHash = r.userHash;
        window.BAKERY_USER = r && r.user ? r.user : null;
        document.dispatchEvent(new CustomEvent('bakery:ready', { detail: r || {} }));
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* Периодически расширяем окно: Telegram может пересчитать размеры */
  setInterval(function () { if (isTG) safe(function () { tg.expand(); }); }, 3000);
})();
