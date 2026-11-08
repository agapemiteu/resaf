# Merchant integration

Keep the product catalog and checkout in your application. Use Resaf for claims, commitments, reservation deadlines and settlement. The current Sandbox implementation has one merchant, USD payments and quantity-one resources.

The [OpenAPI contract](openapi.yaml) lists request bodies and responses. The hosted [developer playground](https://resaf-api.onrender.com/developers) runs public discovery requests.

## Credentials

Use `MERCHANT_API_KEY` for policy changes and the server-issued buyer key for reservation actions. Send credentials as `Authorization: Bearer <key>`. Buyer identity comes from that credential. Keep these keys on the server.

Send a fresh `Idempotency-Key` with each logical write. Retry the same operation with the same key; reusing a key for different input is rejected.

## Reservation sequence

| Request                                           | Result                                                          |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/v1/resources/{id}`                      | Inspect availability.                                           |
| `GET /api/v1/resources/{id}/policy`               | Read the current terms.                                         |
| `POST /api/v1/reservations`                       | Obtain an approval claim and accepted terms.                    |
| `POST /api/v1/reservations/{id}/commitment`       | Create the PayPal commitment order and return its approval URL. |
| `POST /api/v1/reservations/{id}/confirm`          | Verify the approved payment and activate the reservation.       |
| `GET /api/v1/reservations/{id}`                   | Read reservation and payment state.                             |
| `POST /api/v1/reservations/{id}/purchase`         | Start the separate booking checkout.                            |
| `POST /api/v1/reservations/{id}/confirm-purchase` | Verify purchase and settle the commitment.                      |
| `POST /api/v1/reservations/{id}/release`          | Release the reservation and settle under its terms.             |
| `GET /api/v1/reservations/{id}/receipt`           | Retrieve the verified purchase confirmation.                    |

The signed PayPal return route also confirms payments. Discovery is public; reservation actions require ownership.

## Publish a policy

Send `POST /api/v1/resources/{id}/policy` with a merchant bearer key and an idempotency key. For the seeded example, use `demo-resource-001`.

```json
{
  "commitment_amount": "2.00",
  "currency": "USD",
  "payment_mode": "CAPTURE",
  "hold_duration_seconds": 600,
  "approval_claim_seconds": 300,
  "max_active_holds_per_buyer": 1,
  "repeat_cooldown_seconds": 3600,
  "purchase_refund_bps": 10000,
  "release_refund_bps": 5000,
  "expiry_refund_bps": 0
}
```

Omit `effective_at` to apply immediately, or supply a timestamp with a timezone to schedule a change. A policy update creates an immutable version. Accepted reservations retain their original amounts and refund conditions.

Optional automatic pricing uses demand thresholds, minimum and maximum amounts, a step size and a cooldown. The business agent recommends a permitted change; server code checks those limits before publishing the next version.
