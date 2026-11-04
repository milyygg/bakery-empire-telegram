
const GAME_URL = "https://t.me/bakeryempirebot/bakeryempire";
const ALLOWED_ORIGIN = "https://milyygg.github.io";
const MAX_SAVE_BYTES = 256 * 1024;
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

const WELCOME = `🥐 Добро пожаловать в «Булочную империю»!

Тебе досталась маленькая пекарня от дедушки. Теперь только от тебя зависит, превратится ли она в огромную империю!

🍞 Выпекай и зарабатывай.
🏪 Открывай новые производства.
👨‍🍳 Нанимай помощников.
🚀 Развивай свою империю.

Нажми кнопку ниже, чтобы начать играть!`;
const HELP = `🍞 Нажимай на булочку, чтобы зарабатывать монеты.
🏪 Покупай производства: они приносят доход без нажатий.
👨‍🍳 Открывай улучшения и выполняй задания.
🌾 Престиж открывается после нужного задания и достаточного дохода. Он сбрасывает монеты, производства и обычные улучшения, но даёт постоянные бонусы. Перед подтверждением прочитай окно сравнения.
💾 Прогресс сохраняется на устройстве. Облачное сохранение находится на этапе проверки. Не очищай данные приложения и не удаляй локальную копию.

Кнопка ниже открывает игру.`;
// Best-effort per-isolate throttle, not a distributed guarantee.
const replies = new Map();
function validSave(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  if (!Array.isArray(s.own) || s.own.length !== 12 || !s.own.every(n => Number.isSafeInteger(n) && n >= 0)) return false;
  if (!['coins','total','resets','last','clicks'].every(k => Number.isFinite(s[k]) && s[k] >= 0)) return false;
  function safe(v, depth = 0) {
    if (depth > 20) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    if (!v || typeof v !== 'object') return true;
    return Object.entries(v).every(([k,x]) => !['__proto__','constructor','prototype'].includes(k) && safe(x,depth+1));
  }
  return safe(s);
}

function json(body, status = 200, origin = null) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
    headers["Access-Control-Allow-Methods"] = "GET, PUT, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Vary"] = "Origin";
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function bytesToHex(bytes) {
  return Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message)
    )
  );
}

function equalHex(a, b) {
  if (
    !/^[0-9a-f]{64}$/i.test(a || "") ||
    !/^[0-9a-f]{64}$/i.test(b || "")
  ) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < 64; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

async function authenticate(request, token) {
  const authorization =
    request.headers.get("Authorization") || "";

  if (!authorization.startsWith("tma ")) {
    return null;
  }

  const raw = authorization.slice(4);

  if (!raw || raw.length > 8192) {
    return null;
  }

  const params = new URLSearchParams(raw);
  const entries = Array.from(params.entries());

  if (
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    return null;
  }

  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);

  if (
    !receivedHash ||
    !Number.isSafeInteger(authDate) ||
    authDate > now + 60 ||
    now - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    return null;
  }

  const checkString = entries
    .filter(([key]) =>
      key !== "hash"
    )
    .sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await hmac(
    encoder.encode("WebAppData"),
    token
  );

  const calculatedHash = bytesToHex(
    await hmac(secret, checkString)
  );

  if (!equalHex(receivedHash, calculatedHash)) {
    return null;
  }

  try {
    const user = JSON.parse(
      params.get("user") || "null"
    );

    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0
    ) {
      return null;
    }

    return String(user.id);
  } catch {
    return null;
  }
}

async function handleSave(request, env, origin) {
  if (origin && origin !== ALLOWED_ORIGIN) {
    return json(
      { error: "Origin not allowed" },
      403
    );
  }

  if (!env.BOT_TOKEN || !env.DB) {
    return json(
      { error: "Server configuration missing" },
      503,
      origin
    );
  }

  const telegramId = await authenticate(
    request,
    env.BOT_TOKEN
  );

  if (!telegramId) {
    return json(
      { error: "Telegram authentication required" },
      401,
      origin
    );
  }

  if (request.method === "GET") {
    const record = await env.DB.prepare(
      "SELECT save_data, revision FROM player_saves WHERE telegram_id = ?"
    )
      .bind(telegramId)
      .first();

    if (!record) {
      return json({
        exists: false,
        revision: 0,
        data: null
      }, 200, origin);
    }

    let data;

    try {
      data = JSON.parse(record.save_data);
    } catch {
      return json(
        { error: "Stored save is invalid" },
        500,
        origin
      );
    }

    return json({
      exists: true,
      revision: record.revision,
      data
    }, 200, origin);
  }

  const length = Number(
    request.headers.get("Content-Length")
  );

  if (
    Number.isFinite(length) &&
    length > MAX_SAVE_BYTES + 4096
  ) {
    return json(
      { error: "Save too large" },
      413,
      origin
    );
  }

  const reader = request.body?.getReader();
  let bodyText = '', size = 0;
  if (reader) {
    const decoder = new TextDecoder();
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SAVE_BYTES + 4096) { await reader.cancel(); return json({error:'Save too large'},413,origin); }
      bodyText += decoder.decode(value,{stream:true});
    }
    bodyText += decoder.decode();
  }

  if (
    encoder.encode(bodyText).byteLength >
    MAX_SAVE_BYTES + 4096
  ) {
    return json(
      { error: "Save too large" },
      413,
      origin
    );
  }

  let payload;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    return json(
      { error: "Invalid JSON" },
      400,
      origin
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !Number.isSafeInteger(payload.revision) ||
    payload.revision < 0 ||
    !payload.data ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    return json({
      error: "Expected { revision: nonnegative integer, data: object }"
    }, 400, origin);
  }

  if (!validSave(payload.data)) return json({error: "Invalid game save"}, 400, origin);
  const saveData = JSON.stringify(payload.data);

  if (
    encoder.encode(saveData).byteLength >
    MAX_SAVE_BYTES
  ) {
    return json(
      { error: "Save too large" },
      413,
      origin
    );
  }

  if (payload.revision === 0) {
    const result = await env.DB.prepare(
      "INSERT INTO player_saves (telegram_id, save_data, revision) VALUES (?, ?, 1) ON CONFLICT(telegram_id) DO NOTHING"
    )
      .bind(telegramId, saveData)
      .run();

    if (result.meta?.changes === 1) {
      return json({
        ok: true,
        revision: 1
      }, 200, origin);
    }
  } else {
    const result = await env.DB.prepare(
      "UPDATE player_saves SET save_data = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ? AND revision = ?"
    )
      .bind(
        saveData,
        telegramId,
        payload.revision
      )
      .run();

    if (result.meta?.changes === 1) {
      return json({
        ok: true,
        revision: payload.revision + 1
      }, 200, origin);
    }
  }

  const current = await env.DB.prepare(
    "SELECT revision FROM player_saves WHERE telegram_id = ?"
  )
    .bind(telegramId)
    .first();

  return json({
    error: "Revision conflict",
    revision: current?.revision ?? 0
  }, 409, origin);
}

async function handleWebhook(request, env) {
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
    return new Response(
      "Server configuration missing",
      { status: 503 }
    );
  }

  const secret = request.headers.get(
    "X-Telegram-Bot-Api-Secret-Token"
  );

  if (secret !== env.WEBHOOK_SECRET) {
    return new Response(
      "Unauthorized",
      { status: 403 }
    );
  }

  let update;

  try {
    update = await request.json();
  } catch {
    return new Response(
      "Invalid JSON",
      { status: 400 }
    );
  }

  const message = update.message;
  if (message?.chat?.type !== 'private') return new Response('OK');

  if (
    !message?.chat?.id ||
    typeof message.text !== "string"
  ) {
    return new Response("OK");
  }

  const command = message.text
    .trim()
    .split(/\s+/)[0]
    .split("@")[0];

  const key = String(message.chat.id);
  const previous = replies.get(key);
  if (previous && (previous.id === update.update_id || Date.now()-previous.at < 3000)) return new Response('OK');
  if (replies.size >= 2000) replies.delete(replies.keys().next().value);
  replies.set(key,{id:update.update_id,at:Date.now()});
  const text = command === '/start' ? WELCOME : command === '/help' ? HELP : 'Чтобы начать игру, нажми кнопку ниже. Инструкция: /help.';
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 Играть в Булочную империю",
                url: GAME_URL
              }
            ]
          ]
        }
      })
    }
  );

  if (!response.ok) {
    replies.delete(key);
    console.error(
      "Telegram sendMessage failed",
      response.status
    );

    return new Response(
      "Telegram API error",
      { status: 502 }
    );
  }

  return new Response("OK");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (url.pathname === "/webhook") {
      if (request.method !== "POST") {
        return new Response(
          "Method not allowed",
          { status: 405 }
        );
      }

      return handleWebhook(request, env);
    }

    if (url.pathname === "/api/save") {
      if (request.method === "OPTIONS") {
        if (origin !== ALLOWED_ORIGIN) {
          return new Response(null, {
            status: 403
          });
        }

        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin":
              ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods":
              "GET, PUT, OPTIONS",
            "Access-Control-Allow-Headers":
              "Authorization, Content-Type",
            "Access-Control-Max-Age": "600",
            "Vary": "Origin"
          }
        });
      }

      if (
        request.method !== "GET" &&
        request.method !== "PUT"
      ) {
        return json(
          { error: "Method not allowed" },
          405,
          origin
        );
      }

      try {
        return await handleSave(
          request,
          env,
          origin
        );
      } catch (error) {
        console.error(
          "Save API error",
          "request failed"
        );

        return json(
          { error: "Internal server error" },
          500,
          origin
        );
      }
    }

    return new Response(
      "Bakery Empire Bot is running",
      { status: 200 }
    );
  }
};
