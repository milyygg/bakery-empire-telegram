# Staging

URL: https://bakery-empire-staging.miloserdovfeed.workers.dev

Separate Worker bakery-empire-staging and D1 bakery-empire-staging-db. Production resources, webhook and Pages unchanged. No player saves copied.

Build: node staging/build.mjs
Config: staging/wrangler.jsonc. DB binding points exclusively to staging.
Generated worker and public assets are ignored by Git. Build copies the PR game, replaces its save endpoint and disables legacy Telegram CloudStorage. Browser storage uses a separate origin. No payment backend or webhook is exposed.

Authentication uses Telegram's official Ed25519 public key. BOT_ID and TEST_USER_IDS are intentionally empty until the test Mini App and testers are agreed. No BOT_TOKEN is configured. No signature bypass exists. Anonymous and forged API requests return 401; unlisted authenticated testers are rejected.

Verified 2026-11-05:
- Actual remote D1 SQL write/read and conditional revision update: one update applied, stale revision affected zero rows. Separate row lookup returned no data. Synthetic qa-* records removed.
- Deployed GET /api/save without auth: 401; forged auth: 401; foreign origin: 403; POST /api/save: 405; webhook and invoice endpoints: 404.
- HTTP 200 for game assets; cloud-saves.js points to staging, not production.
- Existing three mocked server tests pass. These are not real Telegram integration tests.
- Node HTTP integration encountered ECONNRESET/stalling; independent PowerShell HTTP checks succeeded. Test now has a timeout.

Pending: real valid Telegram initData, API writes/reads across two authorized users, real concurrent API requests, browser/device offline restoration and prestige. SQL checks do not establish authenticated API ownership behavior.

Next: obtain owner approval to create a separate named staging Mini App under the existing bot, leaving its current Main Mini App and webhook unchanged. Retrieve its public bot ID and agree tester IDs. Configure staging only, then test valid Ed25519 authentication. No real purchases.

Sources: https://core.telegram.org/bots/webapps#validating-data-for-third-party-use ; https://developers.cloudflare.com/workers/static-assets/binding/

## Продолжение проверки 2026-11-05

Повторно подтверждены три локальных серверных теста, сборка staging и синтаксис cloud-saves.js и staging/worker.mjs. Настоящая staging D1 прошла INSERT/SELECT, условное обновление revision и отказ устаревшей revision; созданные qa-записи удалены. Это последовательные SQL-операции, не одновременные запросы API.

Node HTTP-проверка завершилась TimeoutError. Независимый Invoke-WebRequest подтвердил /api/save = 401, / = 200 и /cloud-saves.js = 200. Полный интеграционный тест не считается пройденным.

### Выпуск и откат

До выпуска: проверить настоящий Telegram initData на staging, двух пользователей и два устройства, офлайн/конфликт/престиж; получить актуальный production Worker и схему D1; экспортировать резервную копию D1 и сохранить текущие версии Worker/frontend. Проверить совместимость существующих таблиц с новым API без удаления данных.

После отдельного подтверждения владельца: сначала совместимый Worker, затем frontend; проверить авторизованное чтение/запись и запуск. При ошибке вернуть предыдущие Worker и frontend. Откат кода не откатывает D1; не удалять таблицы и не восстанавливать старую БД поверх новых сохранений без отдельного анализа.

### Действия в BotFather

В @BotFather: /newapp, выбрать @bakeryempirebot, создать отдельную Mini App с названием Bakery Empire Staging, short name bakerystaging и URL https://bakery-empire-staging.miloserdovfeed.workers.dev . Если имя занято, выбрать другое свободное. Картинку предоставить по запросу BotFather. Не менять Main Mini App, текущую bakeryempire и webhook.

Передать публичный числовой ID бота и числовые ID тестировщиков для BOT_ID/TEST_USER_IDS. Токен в чат не нужен. После настройки ожидаемая ссылка: https://t.me/bakeryempirebot/bakerystaging . Само создание приложения в этой проверке не выполнялось.

## Test Mini App setup

Owner created https://t.me/bakeryempirebot/bakerytest . Staging now displays the current Telegram user ID locally; this unverified display is only for allowlist setup, never server authorization. No initData or token is displayed or persisted by this panel.

BOT_ID and TEST_USER_IDS remain empty (fail closed). Public t.me and OAuth embed pages did not expose a verifiable bot ID. Owner can retrieve the numeric prefix before the colon from the existing bot token in BotFather, sending only that numeric ID and never the token or its suffix. No token rotation is necessary. Open bakerytest to read the tester ID; configure exact numeric IDs only, no wildcard. Real signed Telegram API checks remain pending these values and an actual launch.

Staging redeployed with identity panel; three local tests passed. Production, webhook, main and primary Mini App unchanged.

## Allowlist deployed 2026-11-05

Configured BOT_ID supplied by owner and exactly one authorized tester in staging/wrangler.jsonc. Deployed version e976ded0-c9f8-4ee3-9632-91a15a990425. No production changes.

Three mocked server tests pass. Actual staging D1 write/read and stale revision checks pass, test rows cleaned. Independent HTTP checks: anonymous 401, forged signature for allowlisted user 401, foreign Origin 403, invoice route 404. Full Node HTTP suite timed out and is not a pass.

Next: owner must close and reopen https://t.me/bakeryempirebot/bakerytest, choose staging local progress if prompted, earn a small amount and wait for cloud confirmation. Close/reopen to confirm restoration. Never send initData or tokens. Successful signed API authentication remains unverified until that launch; provided bot ID is not independently verified via getMe.
