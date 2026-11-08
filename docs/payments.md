# Payments

The PayPal adapter uses the Sandbox Orders and Payments APIs. The business chooses the commitment and refund terms; Resaf verifies PayPal results before changing the corresponding reservation or settlement state.

## Payment modes

| Mode        | Reservation commitment                                        | Settlement                                                      |
| ----------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `CAPTURE`   | Verify a completed capture before activating the reservation. | Refund the accepted percentage for purchase, release or expiry. |
| `AUTHORIZE` | Verify an authorization before activating the reservation.    | Void the outstanding authorization when the reservation ends.   |

The default demo uses `CAPTURE`: $2 commitment, a separate $25 booking, 100% commitment refund after purchase, 50% on early release and 0% on expiry. Refund percentages apply to the commitment. The final booking is a separate payment.

Refund fields use basis points: `10000` is 100%, `5000` is 50%, and `0` retains the fee. Arithmetic uses integer cents and rounds fractional cents down.

## Verification and retries

- Activation checks provider status, amount, currency and the current claim deadline.
- Purchase verifies its capture before marking inventory sold.
- Settlement uses the original commitment capture ID and accepted policy version.
- A refund remains pending until PayPal confirms it.
- Persistent operation records and deterministic `PayPal-Request-Id` values protect retries.
- Uncertain outcomes are reconciled against PayPal. An activation that fails after capture queues a full commitment refund.

PayPal webhooks are verified and deduplicated. Configure `PAYPAL_WEBHOOK_ID` with the ID registered for your Sandbox app. The browser and model never receive PayPal secrets.

## Authorization utility

The optional CLI checks the authorization-and-void lifecycle:

```sh
npm run paypal:smoke -- create
npm run paypal:smoke -- authorize <order-id>
npm run paypal:smoke -- inspect <authorization-id>
npm run paypal:smoke -- void <authorization-id>
```

After `create`, approve PayPal's returned URL using a Sandbox Personal buyer, then run `authorize`. Operation IDs and responses are saved in ignored `.local/paypal-smoke.jsonl`.

## Implementation

- [PayPal adapter](../src/integrations/paypal/client.mjs)
- [Commitment activation](../src/core/reservations/commitment.mjs)
- [Capture and refund settlement](../src/core/reservations/fees.mjs)
- [Purchase](../src/core/reservations/purchase.mjs)
- [Webhook verification](../src/integrations/paypal/webhooks.mjs)

Provider reference: [PayPal Orders](https://developer.paypal.com/docs/api/orders/v2/) and [Payments](https://developer.paypal.com/docs/api/payments/v2/).
