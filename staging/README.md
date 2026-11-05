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

## ID correction and staging Ed25519 tests

Observed Telegram initDataUnsafe.user.id was 549862623. The panel never read BOT_ID. Previous owner-provided IDs appear transposed; staging now uses BOT_ID=9268949608 and TEST_USER_IDS=549862623. Bot ID remains a hypothesis until Telegram signature verifies after relaunch. No signature bypass added.

Both diagnostic and synchronization requests use nonempty WebApp.initData in Authorization: tma, not initDataUnsafe. Public key, canonical sorting, excluded hash/signature, newline encoding and bot ID prefix checked against https://core.telegram.org/bots/webapps#validating-data-for-third-party-use . User identity is parsed only after signature verification. Panel labels its unsafe ID as unverified.

Four local tests pass, including generated staging code tested with an in-memory fixture public key: correct bot accepted, wrong bot 401, signed unlisted user 403, tampering 401. Fixture key is never written to deployment. These are not real Telegram tests. Next: relaunch bakerytest and observe API 200 and cloud save; query D1 after real launch.

## Seasonal save compatibility fix

Root cause reproduced: base BUILD has 12 entries, seasonal additions push santaSleigh and giftFactory, and game expands own to 14. Both validators required exactly 12. Client copy() rejects the expanded save before PUT, so that message is not evidence of a server rejection. Accept only existing lengths 12 or 14 with nonnegative safe integer counts; preserve all fields and counts. Authorization, revision envelope and 256 KiB bound unchanged.

New test executes actual BUILD declarations, seasonal additions and fresh() from index.html, tests both validators, unsupported length, negative counts and oversized client JSON. Actual fresh fixture is 519 UTF-8 bytes; PUT envelope {revision:0,data:state} is 541 bytes. This is not the user's private save size. Five tests and syntax checks passed. Real signed Telegram write remains pending relaunch and cloud selection.

## Final available verification 2026-11-05

Actual tester row read from remote staging D1: exists, revision=4, 819 UTF-8 bytes, 12 production entries, updated_at=2026-11-05 10:10:25 UTC. No user save data printed or modified. Revision 4 confirms initial creation and subsequent successful updates under the deployed API. Independent signed recovery across devices is not yet established.

Stale diagnostic root cause: it fetched GET once before initial PUT and retained revision=0. Added periodic metadata refresh every 30 seconds and a regression test proving 0 -> 4 display update; no raw initData logged. Six Node tests pass. Edge browser test passes mocked initial migration, conflict/write pause, explicit recovery, reopen, offline retry with prestige-like reset state. Actual prestige button and two-device Telegram flow remain manual gaps.

Real HTTP suite tests/staging-http.ps1 passes anonymous GET/PUT, forged auth, foreign origin, disabled webhook/invoice and staging endpoint isolation. Use it instead of unstable Node fetch HTTP checks; no auth bypass. Existing remote D1 SQL checks also passed with temporary qa rows removed. User row was read only.

Release remains gated on real two-device restoration/conflict/offline tests, current production export/schema compatibility and production backup before separately approved release. Client economy remains editable; no trusted paid balance or leaderboard enabled by this work. Bot metadata instructions and release/rollback sequence remain in BOT_SETUP.md and this file.

## Loading and synchronization follow-up

Measured Edge cold/warm DOMContentLoaded before: staging 2000/608 ms, production 1297/110 ms. After: staging 1477/336 ms. A second production cold run varied to 5202 ms, warm 107 ms: network variation prevents attributing these differences solely to code. HTML is ~1.79 MB source/~1.04 MB encoded; embedded art unchanged. SDK measured 1425 ms in first cold staging run, 331 ms in later run. This is desktop Edge, not Android WebView or Telegram native splash measurement.

Confirmed code delays: loading overlay enforces 7000 ms minimum; Telegram.ready called by adapter at DOMContentLoaded. Now ready is signaled immediately after SDK and loader minimum is 350 ms (6650 ms less artificial minimum). Game initialization and language await remain. No imagery removed or recompressed. Cloud modal previously could enter top layer while html:not(.app-ready) hid it, intercepting loading interactions. Defer cloud connect until bakery:game-ready; mobile-emulated regression test verifies skip, visible subsequent choice and intact progress. Unmodified production was read only.

Cloud copy simplified, mobile status text enlarged. Identical snapshots continue automatically; unchanged acknowledged remote still continues local. Actual mismatches require choice with local backup. Online event retries pending snapshot immediately; stale revision still yields 409 and pauses writes, never merges balances. Status after PUT only follows successful server confirmation. Diagnostic panel remains staging build only.

Six Node tests and both Edge browser tests passed, plus real PowerShell staging HTTP checks. Real Android native splash timing, true simultaneous two-device changes and device offline restoration after these changes still need one final owner run. Older cloud metadata does not establish a conflict by itself. No user rows edited or deleted.

## Stabilization 2026-11-05

Owner confirmed two-device recovery, offline retries and conflict preservation. Crystal fluctuation 0 -> 5 -> 30 could not be reproduced as data corruption; separate local/cloud snapshots can have different balances, and pre-cloud display uses local state. No real balance edited. Added crystals to version-choice summary. Browser tests now cover actual achievement once-only reward, crystal shop spending at its current 1.3-adjusted price, reload persistence, remote 30-crystal restoration, and offline retry with spent balance 5 (no max or addition merge).

Removed competing gem polling (120 ms), unified counter markup, skipped identical building text writes, and scoped gem-icon observer to added subtree instead of parent-wide scans. Desktop mobile-emulated idle profile over 3 seconds before: production 595 mutations/536 frames, staging 636/541. Local corrected run 569 mutations/476 frames. Runs are unthrottled and variable, not Android FPS evidence; no reproduction of reported 10 FPS. Real Android remains unavailable. Graphics assets unchanged.

Loading screen informational minimum restored to 3 seconds, optional Skip bypasses that minimum while language/game initialization is retained; early Telegram.ready retained. Existing title/tips/creator/progress remain. Cloud choice still waits for game-ready.

Price inversion caused by story order 0,1,3,2 while index prices were 0,250,1200,6000. Swapped only prices for IDs 2/3: display order now 0,250,1200,6000,30000 and unchanged remainder. Purchase ownership IDs and bonuses unchanged; existing purchases retained. Full story-order monotonicity test passes.

Wood/brass location sign and aligned crystal inline flex counter added; mobile screenshot inspected at 390x844. No image assets changed. Historical crystal-loss cause and actual Android performance are unresolved validation limitations, not claimed fixes. Seven Node tests, loading browser, actual economy browser and mocked cloud browser pass; live staging HTTP passes. Production/main/webhook untouched.
