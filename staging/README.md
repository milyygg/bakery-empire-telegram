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
