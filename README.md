# Resaf

Resaf is a merchant-facing API for financially backed, time-limited reservations requested by shopping agents. The demo uses one scarce product. Merchant policy and PayPal verification, rather than the agent, determine whether exclusivity is granted.

## Current status

- A real PayPal Sandbox $2 authorization and void lifecycle has been verified with the CLI harness.
- The API creates provisional approval claims and now includes PayPal commitment and confirmation routes. A full reservation requires a verified PayPal authorization. This new flow still needs a live buyer-approval test. Purchase checkout remains unimplemented.
- The Render deployment responds at `https://resaf-api.onrender.com`. The seeded product, concurrent provisional claims, early release, and repeat cooldown were verified against the live PostgreSQL database. Payment-backed activation is deployed and awaits a live buyer-approval test.

## Run locally

Requires Node.js 24 and PostgreSQL. Copy `.env.example` to `.env.local`, then set `DATABASE_URL` and two distinct long random demo keys. Keep PayPal Sandbox credentials in this file as well. The file is ignored by Git.

```powershell
npm ci
npm run db:setup
node --env-file=.env.local server.mjs
```

`GET /health` confirms the process is running. `GET /api/v1/resources/bag-001` reads the seeded product. `POST /api/v1/reservations` requires a bearer demo key and an `Idempotency-Key` header; it returns a 90-second provisional claim and the policy's commitment quote. The two demo keys bind requests to two server-defined buyers. The caller cannot choose a buyer ID.

After creating a claim, the same buyer calls `POST /api/v1/reservations/{id}/commitment`. The response contains PayPal's approval URL. After the human approves it, call `POST /api/v1/reservations/{id}/confirm` before the provisional claim expires. The server verifies the PayPal authorization and only then activates a ten-minute reservation. `POST /api/v1/reservations/{id}/release` ends the reservation and attempts to void the authorization. A pending void is reported separately from the reservation state.

The current API contract is [docs/openapi.yaml](docs/openapi.yaml). It is the source to import into Postman and APIMatic once the payment routes are complete. The sponsor decision is in [docs/sponsors.md](docs/sponsors.md).

## Render

`render.yaml` defines a free Node web service and free Render Postgres database. Render injects the database's internal connection string. Supply PayPal Sandbox credentials and both demo keys as secret environment variables during Blueprint setup. The startup command applies the initial migration once, seeds the demo records, and starts the API. Free Render Postgres expires after 30 days; the demo needs a backup or paid database for longer retention.

## PayPal Sandbox lifecycle check

The CLI harness uses only `api-m.sandbox.paypal.com`.

```powershell
npm run paypal:smoke -- create
npm run paypal:smoke -- authorize <order-id>
npm run paypal:smoke -- void <authorization-id>
```

After `create`, approve the PayPal-provided URL using a Sandbox Personal buyer. The default `PAYPAL_RETURN_URL` points to example.com and is only a placeholder for this CLI check; the order status is verified by the next command. The deployed API has a separate `/paypal/return` route for its reservation flow. The script records request IDs, provider IDs, and verified states in ignored `.local/paypal-smoke.jsonl`. Reuse a recorded `PayPal-Request-Id` for a retry after an uncertain network result.
