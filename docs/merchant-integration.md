# Merchant policy integration

The demo merchant publishes policies with its server-side `MERCHANT_API_KEY`. Agents use separate buyer credentials. Never put the merchant key in browser code or an agent prompt.

1. Discover terms with `GET /api/v1/resources/bag-001/policy`.
2. Publish changes with `POST /api/v1/resources/bag-001/policy`, a merchant bearer key, and a fresh `Idempotency-Key`.
3. Agents request reservations and receive the commitment amount and accepted policy terms.
4. Resaf verifies the PayPal commitment before activating the reservation, then settles against that reservation's original policy.

Example policy request:

```json
{
  "commitment_amount": "3.00",
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

Refunds use basis points: `10000` means 100%, `5000` means 50%, and `0` means retain the fee. Omit `effective_at` to apply immediately, or supply a timestamp with a timezone to schedule a change. The newest effective timestamp wins; version breaks ties. Policies are never edited or deleted by this API. Replaying the same key and terms returns the same policy; changing terms under that key is rejected.

The current Sandbox integration supports USD and one merchant with one-unit inventory. The resource ID is generic; the API does not require a product-specific resource shape. Final purchase verification remains to be implemented.

The [OpenAPI contract](openapi.yaml) is the shared source for Postman and APIMatic imports. Generated SDKs and hosted API documentation have not yet been published through APIMatic.
