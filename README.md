# Resaf

Resaf is a merchant-facing API for financially backed, time-limited reservations requested by shopping agents. The demo uses one scarce product. Merchant policy and PayPal verification, rather than the agent, determine whether exclusivity is granted.

## Current status

- A real PayPal Sandbox $2 authorization and void lifecycle has been verified with the CLI harness.
- The captured-fee flow has also passed a live Sandbox test: $2 captured, reservation activated, early release confirmed, $1 refunded, and repeated release produced no duplicate refund record. Merchant policy version 3 now selects this fee mode. See [payment modes](docs/payment-modes.md).
- The live API has activated a reservation after verifying a real PayPal Sandbox $2 authorization. A competing buyer was rejected while it was active. Purchase checkout remains unimplemented.
- The Render deployment responds at `https://resaf-api.onrender.com`. Live PostgreSQL claim concurrency and PayPal activation have been verified. A Cloudflare scheduled run automatically expired the active reservation and voided its PayPal authorization; inventory became available and the former buyer's repeat attempt was rejected by cooldown. Cleanup runs are recorded in PostgreSQL.

## Run locally

Requires Node.js 24 and PostgreSQL. Copy `.env.example` to `.env.local`, then set `DATABASE_URL` and two distinct long random demo keys. Keep PayPal Sandbox credentials in this file as well. The file is ignored by Git.

```powershell
npm ci
npm run db:setup
node --env-file=.env.local server.mjs
```

`GET /health` confirms the process is running. `GET /api/v1/resources/bag-001` reads the seeded product. `POST /api/v1/reservations` requires a bearer demo key and an `Idempotency-Key` header; it returns a five-minute, nonrenewable provisional claim and the policy's commitment quote. The two demo keys bind requests to two server-defined buyers. The caller cannot choose a buyer ID. An expired provisional claim does not trigger the repeat-hold cooldown because it never granted a financially backed reservation.

After creating a claim, the same buyer calls `POST /api/v1/reservations/{id}/commitment`. The response contains PayPal's approval URL. The PayPal return URL verifies the approved order and authorization before activating the ten-minute reservation. The buyer can also call `POST /api/v1/reservations/{id}/confirm` if the return is interrupted; both paths require the provisional claim to remain valid. `POST /api/v1/reservations/{id}/release` ends the reservation and attempts to void the authorization. A pending void is reported separately from the reservation state.

The current API contract is [docs/openapi.yaml](docs/openapi.yaml). It is the source to import into Postman and APIMatic once the payment routes are complete. The sponsor decision is in [docs/sponsors.md](docs/sponsors.md).

## Render

`render.yaml` defines a free Node web service and free Render Postgres database. Render injects the database's internal connection string. Supply PayPal Sandbox credentials, both demo keys, `CALLBACK_SIGNING_SECRET`, and `CRON_SECRET` to the web service. The startup command applies the initial migration once, seeds the demo records, and starts the API. Free Render Postgres expires after 30 days; the demo needs a backup or paid database for longer retention.

`wrangler.toml` defines a free Cloudflare Worker that calls the authenticated `POST /internal/expire` endpoint every minute. This expires due claims and retries PayPal authorization voids independently of browser activity. Set the same `CRON_SECRET` as a Cloudflare Worker secret. The Worker does not receive PayPal or database credentials. The standalone `node scripts/expire.mjs` command can run the same sweep manually.

## PayPal Sandbox lifecycle check

The CLI harness uses only `api-m.sandbox.paypal.com`.

```powershell
npm run paypal:smoke -- create
npm run paypal:smoke -- authorize <order-id>
npm run paypal:smoke -- void <authorization-id>
```

After `create`, approve the PayPal-provided URL using a Sandbox Personal buyer. The default `PAYPAL_RETURN_URL` points to example.com and is only a placeholder for this CLI check; the order status is verified by the next command. The deployed API has a separate `/paypal/return` route for its reservation flow. The script records request IDs, provider IDs, and verified states in ignored `.local/paypal-smoke.jsonl`. Reuse a recorded `PayPal-Request-Id` for a retry after an uncertain network result.
