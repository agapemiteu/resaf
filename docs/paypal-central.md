# PayPal-backed reservation enforcement

PayPal supplies the financial state on which Resaf's paid reservation workflow depends. The merchant defines commitment amounts, deadlines and refund terms. Resaf enforces those rules against inventory and orchestrates the corresponding PayPal operations.

## What makes PayPal essential

| Transition | Required financial evidence | Enforcement |
|---|---|---|
| Approval claim → paid reservation | PayPal capture is `COMPLETED`, with the accepted amount and currency | `confirmFee` verifies the provider response before setting `RESERVED`; the claim must still be valid. |
| Reservation → completed purchase | Verified purchase capture | Inventory is marked sold only after successful payment verification. |
| Purchased/released/expired → settled commitment | The accepted policy determines the refund; PayPal confirms any required refund | A pending refund remains `REFUND_PENDING`; it is not displayed as returned money. |
| Uncertain capture → recovery | Retrieve the existing PayPal order/capture rather than assume success | Persistent operation records and provider request IDs support reconciliation and retry protection. |

Without the verified PayPal commitment, the captured-fee workflow cannot activate its paid reservation. PayPal is therefore a dependency of the access mechanism, as well as the purchase and settlement mechanism.

## Responsibilities

- **Merchant:** defines the fee, reservation duration, repeat restrictions and refund percentages. New policy versions govern future quotes; accepted quotes retain their terms.
- **Resaf:** resolves the trusted buyer, locks inventory, validates eligibility, enforces deadlines, and coordinates payment operations.
- **PayPal:** executes authorization/capture/void/refund operations and provides the financial identifiers and statuses that Resaf verifies.
- **AI:** chooses permitted tools and handles conflicts or approval requests. It cannot declare payment success, alter an accepted quote, or bypass server checks.

PayPal does not set the merchant's inventory limits or enforce Resaf's application timer. A financial authorization and an inventory reservation are separate concepts.

## Recorded demonstration

The current video demonstrates a **captured commitment fee with a policy-based refund**: $2 collected, a separate $25 purchase captured, and $2 refunded after purchase. Its native receipt and the linked provider records come from one Sandbox round. The capture and refund identifiers were independently checked with PayPal's read APIs.

The code also supports the separate authorization-and-void mode described in [payment modes](payment-modes.md). The video does not relabel its captured fee as an uncaptured funds hold or portray its refund as a void.

The timer can release inventory even while financial cleanup is pending. Resaf retains the unresolved financial operation for retry or reconciliation rather than claiming a completed refund.

## Implementation references

- [Commitment activation](../src/core/reservations/fees.mjs): `confirmFee`, `reconcileFeeCaptures`.
- [Policy-based settlement](../src/core/reservations/fees.mjs): `settleFee`.
- [PayPal adapter](../src/integrations/paypal/client.mjs): provider request IDs, capture retrieval, refunds and authorization/void operations.
- [Purchase workflow](../src/core/reservations/purchase.mjs).
- [Expiration worker](../src/core/reservations/sweep.mjs).

Provider documentation: [authorize/capture](https://developer.paypal.com/v5/checkout/auth-capture), [Payments v2](https://developer.paypal.com/api/payments/v2). The [hackathon rules](https://paypalaihackathon.devpost.com/rules) require central PayPal integration.
