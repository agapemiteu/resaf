# Demo interaction patterns

The screen has one primary action and exposes details on demand. Agent tabs use Base UI keyboard semantics, including arrow-key selection. Modal dialogs manage focus. Status text accompanies color and motion; reduced-motion preferences are respected.

A completed scene clears its agent activity and active-session pointer. A verified purchase opens a one-time confirmation; closing it returns to an empty Run state. Refreshing does not reopen completed activity. Server payment records remain available for reconciliation. Live claims survive reload and PayPal return; their accepted quote, hold duration and refund terms stay fixed.

| State | Visible next action |
|---|---|
| Ready | Run |
| Starting / model running | Actual execution in the agent panel |
| Commitment approval | Approve in PayPal |
| Interrupted checkout | Resume the existing checkout |
| Reserved | Complete booking or Release |
| Final payment | Pay in PayPal |
| Purchase verified | One-time confirmation, then clear the scene |
| Rival waiting | Keep this scene active until availability changes |
| Failure without a claim | Brief feedback and a fresh Run state |
| Failure with a live claim | Keep the claim available for recovery |
| Disconnected | Reconnect using reads; do not retry payments blindly |
| Session expired | Sign in before further buyer actions |

The integration strip represents actual use: PayPal commitments, AG Grid current-run contention, Render hosting/PostgreSQL, and a downloadable Postman collection. It does not claim an APIMatic SDK or Bryntum integration.

References:
- [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [Material Design error patterns](https://m1.material.io/patterns/errors.html)
- [Apple feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback)
