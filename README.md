# Resaf

[Live demo](https://resaf-api.onrender.com) ? [Try the API](https://resaf-api.onrender.com/developers) ? [OpenAPI](https://resaf-api.onrender.com/openapi.yaml)

Resaf is an AI reservation agent for businesses, backed by PayPal. It coordinates timed reservations, financial commitments, and policy-based refunds. Developers connect it to their inventory and checkout. The demo uses two AI shoppers competing for one parking space; server-enforced business rules and verified PayPal results govern access and payments.

## Current status

- A real PayPal Sandbox $2 authorization and void lifecycle has been verified with the CLI harness.
- The captured-fee flow has also passed a live Sandbox test: $2 captured, reservation activated, early release confirmed, $1 refunded, and repeated release produced no duplicate refund record. Merchant policy version 3 now selects this fee mode. See [payment modes](docs/payment-modes.md).
- The merchant policy API is live. Access control, idempotent updates, future scheduling, and preservation of existing quotes were checked against Render. See [merchant integration](docs/merchant-integration.md).
- The live API has activated a reservation after verifying a real PayPal Sandbox $2 authorization. A competing buyer was rejected while it was active. Final purchase checkout and verified receipts are implemented; a $25 final purchase and full $2 commitment refund have been independently verified in PayPal Sandbox.
- The Render deployment responds at `https://resaf-api.onrender.com`. Live PostgreSQL claim concurrency and PayPal activation have been verified. A Cloudflare scheduled run automatically expired the active reservation and voided its PayPal authorization; inventory became available and the former buyer's repeat attempt was rejected by cooldown. Cleanup runs are recorded in PostgreSQL.

## Run locally

Requires Node.js 24 and PostgreSQL. Copy `.env.example` to `.env.local`, then set `DATABASE_URL` and two distinct long random demo keys. Keep PayPal Sandbox credentials in this file as well. The file is ignored by Git.

```powershell
npm ci
npm run db:setup
npm run build
node --env-file=.env.local server.mjs
```

`GET /health` confirms the process is running. `GET /api/v1/resources/demo-resource-001` reads the visible parking example. `POST /api/v1/reservations` requires a bearer demo key and an `Idempotency-Key` header; it returns a five-minute, nonrenewable provisional claim and the policy's commitment quote. The two demo keys bind requests to two server-defined buyers. The caller cannot choose a buyer ID. Unpaid claims have a short 60-second retry cooldown; financially backed holds use the accepted business cooldown.

After creating a claim, the same buyer calls `POST /api/v1/reservations/{id}/commitment`. The response contains PayPal's approval URL. The PayPal return URL verifies the authorization or completed capture required by the accepted policy before activating the reservation. The buyer can also call `POST /api/v1/reservations/{id}/confirm` if the return is interrupted; both paths require the provisional claim to remain valid. `POST /api/v1/reservations/{id}/release` ends the reservation and settles the commitment using that policy. Pending settlement is reported separately from the reservation state.

The integration contract is [docs/openapi.yaml](docs/openapi.yaml). Render hosts the application and PostgreSQL database; AG Grid presents competing requests and verified outcomes. See [the sponsor scope](docs/sponsors.md).

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

## Visible AI and purchase confirmations

The main demo accepts a natural-language objective and displays actual model-selected tools as they complete. The optional business agent recommends commitment adjustments using observed demand, within merchant-approved bounds. Accepted prices and refunds remain fixed. See [agent demonstration](docs/agent-demo.md).

Set `GEMINI_API_KEY` for Gemini. Optional `GROQ_API_KEY` enables a tool-calling fallback when Gemini is rate limited or temporarily unavailable (`GROQ_MODEL` defaults to `openai/gpt-oss-20b`). No provider key enters the browser or model prompt. Fallback selects model actions only; it never replays completed payment tools. Groq configuration has no effect without a valid key.

After verified purchase, the UI displays a printable Sandbox confirmation with the final payment ID and separate commitment/refund totals. The receipt endpoint rejects unpaid reservations and rechecks the actual PayPal capture. A real $25 Sandbox capture and full $2 commitment refund were independently verified; the authenticated receipt endpoint returned the matching parking confirmation.

## Focused React demonstration

The frontend uses React, source-owned shadcn-style components over Base UI primitives, and an esbuild production bundle. The public Sandbox opens without a merchant key. Its signed demo session is restricted to its current demo resource; merchant API credentials remain separate. The main card shows one current outcome and next action. Competition, failure tests, receipts, and business controls are separate dialogs. AG Grid appears inside the competition dialog with actual claimant outcomes and expandable backend evidence.

?Start a fresh round? creates a new simulated merchant unit and policy, preserving previous paid sales and receipts. Two independent model runs then compete through the same reservation API. An unpaid provisional winner still needs PayPal approval before exclusive paid reservation. The losing agent waits or stops according to actual inventory and policy responses.

The edge-case dialog exercises real ownership rejection and duplicate-claim rejection. Its transport failure drill is explicitly simulated **before any PayPal request**, and records the same business attention handoff used for real model/tool failures. It creates no payment or fabricated provider result. Business users can mark attention records reviewed in the app; no external messages are sent.
