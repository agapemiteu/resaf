# Architecture

Resaf runs as one Node.js application with a React interface and PostgreSQL database. The browser and AI tools use the same reservation endpoints.

## Reservation flow

```text
Request claim → approve commitment → verify payment → reserve
                                                    ├─ purchase → settle commitment
                                                    ├─ release  → settle commitment
                                                    └─ expire   → settle commitment
```

A provisional claim has a short approval deadline. A paid reservation starts only after Resaf verifies the required PayPal authorization or capture. PostgreSQL row locks serialize access to a quantity-one resource. Purchase obtains a checkout claim before the reservation expires.

Each reservation keeps its accepted policy version. Later price or refund changes apply to future quotes. Inventory can become available while a refund is still pending; reservation and financial states are stored separately.

## Agents

The shopper chooses structured tools to inspect inventory and terms, request a claim, check status, release a reservation and request purchase approval. The side panel shows recorded model and tool activity. Payment approval happens in PayPal.

Gemini is the default model provider. Groq can serve as the primary provider or take over after a temporary Gemini error. Fallback receives the completed tool history and resumes inference. Completed financial tools are not replayed.

The business agent recommends raising, lowering or keeping the next commitment amount. Code checks the configured demand conditions, amount bounds, step and cooldown. Failed model evaluation keeps the previous quote.

## Expiration and recovery

The scheduled worker calls the authenticated cleanup endpoint. A sweep expires due claims and reservations, retries settlement and reconciles uncertain payment operations. Expiration timestamps and operation records live in PostgreSQL, so cleanup continues independently of the browser.

Model and tool failures create business attention records visible in Settings. The failure drill exercises that handoff before sending a payment request.

## Identity

Direct callers use server-side merchant or buyer keys. Buyer keys resolve to fixed demonstration identities. The public interface uses a signed, HttpOnly session limited to its own demo resource. Ownership checks run on the server for reservation actions and receipts.

## Main files

- [HTTP routes](../server.mjs)
- [Reservation claims](../src/core/reservations/claims.ts)
- [Payment settlement](../src/core/reservations/fees.mjs)
- [Purchase completion](../src/core/reservations/purchase.mjs)
- [Shopper](../src/agents/shopper.mjs)
- [Business agent](../src/agents/business.mjs)
- [Cleanup sweep](../src/core/reservations/sweep.mjs)
- [Database migrations](../src/db/migrations/)
