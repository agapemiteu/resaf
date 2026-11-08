# Resaf submission video

Current cut: **Resaf-PayPal-Central.mp4**, 2:51, full original 1920×1080 screen. Prepared November 8, 2026.

PayPal confirmation is a prerequisite for activating a paid reservation, and PayPal confirmation is required before a refund is shown as completed. The merchant defines the policy; Resaf enforces inventory and timing rules. This recorded round demonstrates a captured commitment and refund, not an uncaptured authorization or a void.

The supporting tools are explained in separate scenes, before the closing remarks. Postman is excluded. Resaf remains positioned as an AI reservation agent for businesses.

## 0:00–0:10 · Hook

An AI can reserve the last item, then renew without buying. Resaf uses verified PayPal commitments to make that exclusive access financially accountable.

## 0:10–0:24 · Case

In October 2026, The Verge used Meta's Muse to keep ten RealReal listings on repeating twenty minute holds throughout the day. The retailer tightened transaction defenses, while keeping discovery open.

## 0:24–0:36 · Evidence

Quantum Metric's 2026 benchmark reports forty eight abandoned retail agent carts per purchase, versus about three overall. That measures abandonment, not proven lost sales.

## 0:36–0:59 · Mechanism

PayPal is the financial gate. The business sets fees, deadlines and refunds. Resaf checks PayPal's confirmed payment state before activating a paid reservation. No verified commitment, no paid hold. A claim that expires without commitment opens the opportunity to another buyer. This demo uses capture and refund, rather than an uncaptured funds authorization.

## 0:59–1:21 · Agents

Two AI shoppers now compete for one parking space. These are real tool calls. One gets a short approval claim; the other waits. That claim is not yet a paid reservation. Both follow the same business rules.

## 1:21–1:37 · Rules

Here, two dollars secures ten minutes. Future fees can rise or fall under configured rules; accepted quotes stay fixed. Early release returns half. Expiry retains the commitment under this policy, and the space becomes available again.

## 1:37–1:53 · Commitment

I approve two dollars through PayPal. Resaf verifies the capture, amount, currency and payment ID. Only then does the paid reservation activate. An uncertain PayPal result stays unresolved for reconciliation; the agent cannot declare success.

## 1:53–2:08 · Purchase

PayPal now captures the separate twenty five dollar purchase. Resaf verifies it and marks the unit sold. The accepted business rule then triggers a two dollar PayPal refund.

## 2:08–2:22 · Receipt

The reservation, captures and refund are linked by stored PayPal identifiers. Settlement is marked complete only after PayPal confirms the refund. Here is the verified receipt and financial trail, all using Sandbox test money.

## 2:22–2:29 · Build ai

Gemini chooses structured tools. Groq provides fallback. Neither overrides payment or policy checks.

## 2:29–2:34 · Build grid

AG Grid makes competing requests and their outcomes inspectable.

## 2:34–2:40 · Build render

Render hosts the React and Node app with PostgreSQL. Cloudflare triggers expiration cleanup.

## 2:40–2:51 · Close

Businesses can use Resaf for parking, rooms, tables and scarce products. Our goal is accountable access for people and their agents. Information is free. Scarcity isn't.

## Financial evidence and presentation

The original receipt and the financial trace describe the same recorded Sandbox round. The $2 commitment capture, $25 purchase capture and $2 refund were checked with PayPal's read APIs. The trace uses real returned identifiers, not fabricated proof. All shown funds and inventory are demonstrations.

The original laptop screen is preserved; private PayPal address/profile details receive localized blur. Login and waits are shortened. No application state is invented. Expiry and future-fee rules are explained without fabricating an unrecorded expiry transaction. The narration uses one stock Gemini neural voice and cuts at acoustic pauses.

The 2026 opening distinguishes the RealReal reported experiment from the wider abandonment benchmark. It does not turn abandoned carts into measured revenue loss or claim every agent was banned. Research details: [video-revision-2026.md](video-revision-2026.md). Implementation details: [paypal-central.md](paypal-central.md).

- [The Verge: October 2026 RealReal experiment](https://www.theverge.com/report/1015811/ai-shopping-agents-blocked-amazon-the-realreal-target-meta-muse), [accessible copy](https://thevergenews.pages.dev/report/1015811/ai-shopping-agents-blocked-amazon-the-realreal-target-meta-muse/).
- [Quantum Metric: 2026 Peak Season Benchmark](https://www.quantummetric.com/resources/2026-peak-benchmark).
- [Official hackathon rules](https://paypalaihackathon.devpost.com/rules).
- [PayPal capture/refund and authorization/void operations](https://developer.paypal.com/api/payments/v2).
