# Commitment payment modes

Merchants select the payment mode in an immutable policy version. Existing reservations keep their original policy. Scheduled versions use `effective_at`; the agent receives the current quote and settlement percentages in the reservation response.

- `AUTHORIZE`: verify a PayPal authorization before reservation activation, then void it when the reservation ends. This mode is verified in Sandbox.
- `CAPTURE`: verify a completed capture before activation. Store the capture ID and apply the policy's full, partial, or zero refund on a terminal outcome. Demo policy version 3 selects this mode: $2 collected, $1 refunded on early release, full refund after a verified purchase, and no refund on expiry. The $2 capture and $1 early-release refund were verified against PayPal Sandbox. Purchase completion and fee retention on expiry have not yet been demonstrated end to end.

Refund percentages are integers in basis points: `10000` returns 100%, `2500` returns 25%, and `0` retains the fee. Fractional cents round down. Separate fields govern purchase, early release, and expiry. Failed inventory allocation returns the full captured commitment. Purchase settlement must only run after the merchant has verified the final purchase; purchase checkout is not implemented yet.

The current merchant configuration is database-backed. Add a new policy version with `payment_mode = 'CAPTURE'` and explicit `purchase_refund_bps`, `release_refund_bps`, and `expiry_refund_bps`. The merchant policy API/editor remains to be built. No LLM can change these terms.

## Integration boundary

The merchant or agent supplies its payment authorization flow. Resaf creates the commitment order, returns PayPal's required action when applicable, and verifies the resulting payment server-side before granting a reservation. Payment setup is outside the reservation API. The present demo uses PayPal-hosted approval; unattended agent payment is not yet demonstrated.

The core sequence is: quote terms, collect and verify commitment, reserve, then settle according to the quoted policy. Scheduled policy versions let developers change commitments over time without changing existing reservations.

Source: [PayPal capture refunds](https://developer.paypal.com/api/payments/v2/captures-refund).
