# Commitment payment modes

Merchants select the payment mode in an immutable policy version. Existing reservations keep their original policy. Scheduled versions use `effective_at`; the agent receives the current quote and settlement percentages in the reservation response.

- `AUTHORIZE`: verify a PayPal authorization before reservation activation, then void it when the reservation ends. This mode is verified in Sandbox.
- `CAPTURE`: verify a completed capture before activation. Store the capture ID and apply the policy's full, partial, or zero refund on a terminal outcome. This implementation awaits a Sandbox capture/refund test and is not the default demo policy.

Refund percentages are integers in basis points: `10000` returns 100%, `2500` returns 25%, and `0` retains the fee. Fractional cents round down. Separate fields govern purchase, early release, and expiry. Failed inventory allocation returns the full captured commitment. Purchase settlement must only run after the merchant has verified the final purchase; purchase checkout is not implemented yet.

The current merchant configuration is database-backed. Add a new policy version with `payment_mode = 'CAPTURE'` and explicit `purchase_refund_bps`, `release_refund_bps`, and `expiry_refund_bps`. The merchant policy API/editor remains to be built. No LLM can change these terms.

## Saved payment setup

`node --env-file=.env.local scripts/paypal-saved-payment.mjs create` attempts a PayPal Wallet setup without making a purchase. After the buyer grants consent, `status` checks approval and `confirm` exchanges the setup token for a saved payment token. The harness stores tokens only in ignored `.local/saved-payment-setup.json` and never prints the payment token.

The Sandbox app currently returns HTTP 403 for setup-token creation. General Save payment methods is checked in the dashboard, but PayPal Wallet saving also requires the applicable payment-method feature and billing-agreement/reference-transaction permissions. Do not treat unattended payments as implemented until the setup, token exchange, and subsequent payment have succeeded.

Saved tokens must be bound to the merchant's trusted buyer identity and a persisted spending mandate before agents can use them. The current CLI feasibility harness does not implement that mandate or expose saved-token payments to agents.

Sources: [PayPal Wallet setup](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal), [account configuration](https://developer.paypal.com/api/orders-v2/save-with-purchase/paypal), [capture refunds](https://developer.paypal.com/api/payments/v2/captures-refund).
