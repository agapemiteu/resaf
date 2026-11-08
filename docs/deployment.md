# Deployment

## Render

`render.yaml` defines the Node.js web service and PostgreSQL database. Connect the repository through Render's Blueprint flow and supply the server-side values from `.env.example`. Render injects `DATABASE_URL` and the public service URL.

The build runs `npm ci && npm run build`. Startup runs the SQL migrations and seed before starting `server.mjs`. The health endpoint is `GET /health`.

Set a valid Gemini or Groq key. Add `GROQ_API_KEY` to the service environment if you want fallback. Store buyer keys, the merchant key, callback secret and cleanup secret in Render's environment settings.

The free database has a limited lifetime. Use a persistent database plan or arrange backups for a deployment you intend to keep running.

## PayPal webhook

Register the deployed HTTPS endpoint with your Sandbox app:

```sh
node --env-file=.env.local scripts/setup-paypal-webhook.mjs https://your-service.onrender.com
```

The helper registers `/api/webhooks/paypal` and writes its ID to local `PAYPAL_WEBHOOK_ID`. Set that same value on the Render service.

## Scheduled cleanup

The Cloudflare worker triggers cleanup every minute. Set `RESAF_BASE_URL` in `wrangler.toml` to your deployed service, then configure the worker with the same `CRON_SECRET` used by Render:

```sh
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

The worker sends an authenticated request to `/internal/expire`. The application owns the database and PayPal calls. It expires due reservations and reconciles outstanding financial operations.

For a local cleanup pass:

```sh
node --env-file=.env.local scripts/expire.mjs
```
