# Resaf

## Tagline

PayPal-backed AI reservations. Faster agents. A fair chance for everyone.

## Inspiration

An agent can reach the last available item before a human—and keep it on hold without buying. In an October 2026 experiment, The Verge used Meta Muse to repeatedly hold ten RealReal listings throughout the day. Resaf explores a practical alternative: give temporary exclusivity a financial commitment and an enforceable deadline.

## What it does

Resaf is an AI reservation agent for businesses and the developers building for them. A business connects its inventory and sets commitment fees, time limits and refund conditions. Agents and people can reserve under those terms.

The working demonstration follows two AI shoppers competing for one parking space. One obtains a short payment-approval claim; the other waits. A verified $2 PayPal commitment activates the paid reservation. A separate $25 booking completes, and the accepted policy returns the $2 commitment through PayPal. The receipt separates payment, commitment and refund.

Without commitment, the provisional claim expires so another buyer can try. Early release and expiry follow the accepted refund terms. Future fees can adapt within business-defined limits; existing reservations retain their accepted price and refund promises.

## How it was built

Gemini chooses structured tools, with Groq fallback. Resaf checks policy, ownership and availability on the server. PostgreSQL transactions protect the scarce unit. PayPal is the financial gate: its verified capture must match the required amount and currency before the paid reservation activates. Settlement completes only after PayPal confirms the refund.

AG Grid exposes competing requests and their next permitted actions. Render hosts the React/Node application and PostgreSQL database; Drizzle manages the schema. Cloudflare triggers persistent expiration and reconciliation work independently of the browser.

## The hardest part

Keeping inventory and money consistent when requests race, a payment response is uncertain or a reservation expires during checkout. Separate financial and reservation states, persistent idempotency and reconciliation keep an uncertain result from becoming invented success or a duplicate payment.

## What works

Real model tool calls, competing buyers, verified PayPal Sandbox capture and refund, policy enforcement, a printable confirmation and visible failure handoffs. The demonstrated $2 commitment, $25 booking and $2 return belong to one recorded round. All money is Sandbox test money; the parking space is demonstration inventory.

## Opportunity

Businesses and developers can apply this mechanism to parking, hotel rooms, appointments, services and scarce products. Resaf helps businesses turn agent traffic into genuine commitment and gives another buyer a chance when an unpaid claim expires.

Adobe forecasts $275.1 billion in U.S. online holiday sales for November–December 2026. For a parking operator, ten additional completed $25 bookings daily could generate $7,500 in monthly booking revenue over 30 days. This projected scenario shows the opportunity for businesses and the developers building their reservation systems. Agents move faster. They shouldn't shut everyone else out.

## What's next

Evaluate the reservation and refund rules with a merchant, measure completed bookings and buyer friction, and add an inventory adapter for that merchant's existing system.

## Built with

PayPal Orders and Payments, Gemini, Groq, AG Grid, Render, Cloudflare Workers, React, Node.js, PostgreSQL, Drizzle, JavaScript.

## Links

- Application: https://resaf-api.onrender.com
- Developer playground: https://resaf-api.onrender.com/developers
- Source: https://github.com/agapemiteu/resaf
- Video: add the public YouTube URL after uploading `docs/video-output/Resaf-PayPal-Pitch.mp4`.

## Research

- [The Verge: October 2026 experiment](https://www.theverge.com/report/1015811/ai-shopping-agents-blocked-amazon-the-realreal-target-meta-muse), [accessible copy](https://thevergenews.pages.dev/report/1015811/ai-shopping-agents-blocked-amazon-the-realreal-target-meta-muse/). Transaction defenses tightened; discovery remained possible.
- [Adobe: 2026 U.S. holiday forecast](https://news.adobe.com/news/2026/09/adobe-us-holiday-shopping-season-to-hit-record). U.S. online holiday sales forecast for November–December 2026.
- [Quantum Metric: 2026 benchmark](https://www.quantummetric.com/resources/2026-peak-benchmark). The video compares 48 abandoned retail-agent carts per purchase with about three for retail traffic overall.

## Judge walkthrough

1. Open the application and select **Run**. The demonstration starts a fresh round with two real agents.
2. Watch the side panel for model and tool activity. Open **Race** to inspect the competing claims in AG Grid.
3. Read **Terms**. Approve the commitment through PayPal using a Sandbox Personal buyer account. Return to Resaf if PayPal opens a separate tab.
4. Complete the separate booking checkout in PayPal Sandbox. Inspect the confirmation for the final payment and commitment refund.
5. Alternatively, release a paid reservation or let its deadline pass. The accepted policy determines the financial outcome; the other agent can try when capacity becomes available.
6. Open the developer playground for a public read-only request and the integration contract. **Settings** exposes business terms and bounded automatic pricing. Open **Race → Test failures** for explicit failure cases.

PayPal approval requires a Sandbox buyer login. Provide that testing access privately in the submission's judge instructions; do not publish passwords, merchant keys or provider secrets in the repository. The hosted demo does not require a merchant key typed into its interface.

## Publishing status

The application is hosted. The final local video is 2:42 and 24.38 MB. At the November 8 check, the repository was private and no public YouTube upload had been performed. Make the repository public and add the uploaded video URL before submitting. See [official rules](https://paypalaihackathon.devpost.com/rules).
