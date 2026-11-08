# Resaf

**PayPal-backed AI reservations for businesses.**

[Live demo](https://resaf-api.onrender.com) · [Developer playground](https://resaf-api.onrender.com/developers) · [API reference](docs/openapi.yaml)

Agents can reserve faster than people. Repeated, uncommitted holds can leave everyone else waiting. Resaf connects temporary access to a verified PayPal commitment, a deadline and the business's refund rules.

Businesses and developers can connect Resaf to parking, rooms, appointments, services or scarce products. This Sandbox demonstration uses one merchant and two AI shoppers competing for one parking space.

## How it works

1. The business sets the commitment, reservation duration and refund terms.
2. An agent requests a short payment-approval claim.
3. Resaf verifies the PayPal payment before activating the reservation.
4. The buyer completes the booking, releases the reservation or lets it expire.
5. Resaf settles the commitment under the accepted terms and confirms any PayPal refund.

The business controls policy. The AI chooses tools. Server code enforces ownership, availability and deadlines. PayPal confirms the financial result.

## Try the demo

Open the [live application](https://resaf-api.onrender.com) and select **Run**. Watch the agents in the side panel and open **Race** for their requests in AG Grid.

The default terms are a **$2 commitment**, a **10-minute reservation** and a separate **$25 booking**. Purchase returns the full commitment; early release returns half; expiry retains it. Check **Terms** before approving. All amounts are PayPal Sandbox test money, and checkout requires a Sandbox Personal buyer account.

After purchase, the confirmation shows the payment and commitment refund separately. **Settings** controls future quotes, including automatic fee adjustments within business-defined limits. Accepted prices and refund terms stay fixed.

## Run locally

Requires **Node.js 24+**, **PostgreSQL**, PayPal Sandbox credentials and a Gemini or Groq API key.

Copy `.env.example` to `.env.local` and fill in the values:

| Configuration                              | Purpose                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                             | PostgreSQL connection string.                                                 |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Credentials for your Sandbox merchant app.                                    |
| `GEMINI_API_KEY`, `GROQ_API_KEY`           | Set at least one. Groq also serves as fallback for temporary Gemini failures. |
| `DEMO_AGENT_A_KEY`, `DEMO_AGENT_B_KEY`     | Separate random keys for the two demo buyers.                                 |
| `MERCHANT_API_KEY`                         | Separate random key for merchant integration requests.                        |
| `CALLBACK_SIGNING_SECRET`, `CRON_SECRET`   | Separate random secrets for payment callbacks and cleanup.                    |

Leave unused model keys blank. Keep `.env.local` private. To generate a random key, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

```sh
npm ci
npm run db:setup
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000). The setup command applies SQL migrations and seeds the demonstration merchant, buyers and parking resource. The hosted demo opens without entering a merchant key; direct integration requests use server-side credentials.

## Development

```sh
npm test
npm run format:check
npm run build
```

Use `npm run format` to format source files. Tests cover policy bounds, refund arithmetic, receipts, agent fallback, buyer sessions and UI states. The browser workflow checks the reservation grid on desktop and mobile, including keyboard access and a failed CDN request.

## Project structure

| Path                 | Contents                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `ui/`, `public/`     | React interface, AG Grid view and static assets.                        |
| `src/agents/`        | Shopper tools, inference fallback and business pricing recommendations. |
| `src/core/`          | Reservation, payment and policy rules.                                  |
| `src/integrations/`  | PayPal operations and demonstration inventory.                          |
| `src/db/`            | SQL migrations and seed data.                                           |
| `worker/`            | Scheduled expiration trigger.                                           |
| `tests/`, `scripts/` | Automated checks and setup utilities.                                   |

The app uses React, Base UI, Node.js and PostgreSQL. Gemini and Groq provide model calls, AG Grid shows competing requests, Render hosts the app and database, and Cloudflare triggers expiration cleanup.

- [Architecture](docs/architecture.md)
- [Merchant integration](docs/merchant-integration.md)
- [Payments](docs/payments.md)
- [Deployment](docs/deployment.md)

## License

[MIT](LICENSE).
