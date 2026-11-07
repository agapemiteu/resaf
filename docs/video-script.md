# Resaf submission video

Prepared November 7, 2026. Target final runtime: 2:50–2:55 including transitions. Spoken script: approximately 340 words. Rehearse at a natural pace; use the timestamps as edit targets, not a reason to rush.

## Verified submission constraints

- Deadline: November 12, 2026, noon PST / 21:00 WAT.
- Meaningful AI use; PayPal must be central, using Sandbox.
- Video under three minutes, publicly visible on YouTube, showing the application working on its intended device.
- Public source repository with an open-source license, source/assets, setup and testing instructions.
- Working hosted demo or reproducible runnable build; explain tools used. Provide judging access and English materials or translations.
- Keep judging access available through December 15, 2026, 08:00 Pacific.
- No third-party trademarks or copyrighted music/material without permission. Use original visual cards and source credits rather than article screenshots or copied graphics.
- Five equally weighted criteria: technology, design, potential impact, innovation, presentation.

Sources: [Official rules](https://paypalaihackathon.devpost.com/rules), [submission requirements](https://paypalaihackathon.devpost.com/).

## Evidence for the opening

| Evidence | Permitted claim | Boundary |
|---|---|---|
| [Resy: reservation fraud](https://resy.com/join/resources/restaurant-reservation-fraud/) | Bot/broker bookings had 4× the no-show rate and 2× the late-cancellation rate of ordinary Resy users. Data: April 1–October 23, 2024. | Relative rates, not percentages or counts of people. Covers bots and brokers, not specifically LLM agents. |
| Same Resy operator interviews | Double Chicken Please introduced a $2.50 booking fee per person and restricted repeated bookings. Lilia's operator describes inaccurate guest details and disruption to hospitality. | Evidence that operators use fees AND limits; no measured revenue recovery or claim Resaf invented deposits. |
| [FTC: first BOTS Act cases, 2021](https://www.ftc.gov/news-events/news/press-releases/2021/01/ftc-brings-first-ever-cases-under-bots-act) | FTC alleged three brokers bought over 150,000 tickets using methods including automated reservation/buying software and fictitious accounts. | Tickets are not people. Completed resale purchases are adjacent evidence, not free inventory holds or modern AI-agent behavior. Resaf is not a demonstrated cure for ticket scalping. |
| [DOJ complaint announcement, October 2026](https://www.justice.gov/opa/pr/justice-department-files-complaint-against-california-ticket-broker-using-unlawful-tactics) | Complaint alleges over 18.5 million tickets and at least $120.8 million profit from a broker's activity. | Allegations, not a finding of liability; profits, not merchant losses or AI-caused losses. Omit from narration to keep focus. |
| The RealReal / Muse | The user's supplied example motivates repeated cart holds. | Original Verge pages were inaccessible in this research pass. Do not use it as the sole factual anchor, invent affected-customer counts, or attach a dollar-loss estimate. |

Economic illustration if needed in supporting text: ten unfilled $25 booking slots represent $250 of potential booking revenue. Label this hypothetical. A temporary hold does not necessarily cause a permanent lost sale. No verified worldwide loss or affected-person total attributable specifically to AI reservation agents was found in these sources.

## Narration and shot list

### 0:00–0:16 — Start with the buyer

Visual: original animation of one parking space, a human requesting it, and an automated client holding it. Only three labels: Available → Held → Buyer blocked. This is an illustration, not footage of a deployed parking operator.

> The space exists. The buyer is ready. But they cannot book it—because an automated shopper keeps holding it without buying. Faster agents can turn a useful reservation into a barrier for everyone else.

### 0:16–0:34 — Establish credible pain

Visual: original, uncluttered statistic cards: “4× no-shows” and “2× late cancellations.” Small credit: “Resy · bots and brokers · Apr–Oct 2024.” No copied article screenshot.

> This pressure is already visible in reservations. Resy reports that bot and broker bookings had four times the no-show rate and twice the late-cancellation rate of ordinary users. AI shopping agents make repeated, unattended reservation attempts easier to automate.

### 0:34–0:52 — Introduce the mechanism

Visual: Resaf title, then the actual running application. Show commitment, hold duration and refund terms; briefly open Terms.

> Resaf is a PayPal-backed reservation API for businesses and developers. A temporary hold requires a disclosed financial commitment, a fixed deadline, and repeat limits. The business decides how much comes back after purchase, release, or expiry.

### 0:52–1:15 — Show genuine AI competition

Visual: press Run; show actual model/tool activity on the side. Open Race briefly to show the two backend outcomes in AG Grid. Follow whichever agent actually wins.

> Here is one parking space and two independent AI shoppers. Both discover it, read the terms, and request access through our API. Watch their live tool calls. One gets a short payment-approval claim; the other waits. The paid reservation begins only after PayPal verification.

### 1:15–1:38 — Make PayPal essential

Visual: real Sandbox approval, then verified reservation state. Keep “PayPal Sandbox · test funds” legible. Cut or speed up login/wait time with a clear label; do not fabricate result frames.

> This demo collects a two-dollar commitment through PayPal Sandbox. The buyer approves; Resaf verifies the completed payment and stores its transaction ID before activating the hold. Changing an agent name cannot bypass the buyer's reservation limits.

### 1:38–2:00 — Explain adaptation and failure

Visual: show the real Business bounds control. Only show an automatic price decision if an actual recorded evaluation exists. Briefly show an existing real denial or label the failure drill “Simulated timeout.”

> Businesses can set bounds for AI-assisted commitment pricing. New quotes can rise or fall with demand; existing refund promises stay fixed. If a request fails, the agent waits, stops, or flags the business. Expiration releases inventory automatically; refunds follow the accepted policy.

### 2:00–2:29 — Prove the commercial result

Visual: separate real $25 Sandbox booking approval. Show actual capture confirmation and $2 refund confirmation, then the verified Sandbox receipt. Pause long enough to read the amounts. Never state a refund completed while its status is pending.

> Now the buyer completes the separate twenty-five-dollar booking. PayPal confirms payment, the resource becomes sold, and this policy returns the full two-dollar commitment. The receipt shows the verified payment and refund. One unit, one successful buyer, and a traceable financial outcome.

### 2:29–2:50 — Show the API and close

Visual: /developers → Send live request → actual HTTP response → downloadable API contract. Finish with a simple Resaf end card. Optional tiny text credits for Render, AG Grid and available Postman collection; do not claim unimplemented sponsor integrations.

> Developers integrate the reservation API with their own inventory and checkout. We demonstrate parking; the same pattern could support hotel rooms, restaurant tables, or scarce products. Resaf makes temporary exclusivity accountable—so agents can reserve, businesses set the rules, and other buyers get another chance. Information is free. Scarcity isn't.

## Recording notes

- Record real browser footage, then edit it around this narration. Leave about five seconds below the three-minute ceiling.
- Sign into the demo and Sandbox buyer before recording. Never record keys, passwords, account emails or private customer details.
- Use one fresh round, one merchant, one scarce unit. The competing agents' winner can vary; never label a predetermined winner.
- Capture commitment approval, reservation, separate purchase, refund, and receipt from the same round. All money is Sandbox test money; the parking inventory is a persisted merchant simulation.
- No need to wait ten minutes on camera. Expiration can be explained while showing the configured limit. Show a genuine observed expiry in a clearly labelled cut only if recorded.
- The current receipt is displayed once and clears the background scene. Record it before closing. Refresh now starts clean.
- If a pending financial operation takes time, label an edited wait. If it has not completed, do not narrate a completed refund.
- This demo requires buyer approval for each checkout. Do not claim unattended wallet payments, universal agent identity, guaranteed fairness, measured abuse reduction, or production hotel/parking integrations.
- Before submitting, verify repository visibility/license and judge access. The last confirmed repository state was private; the latest GitHub visibility check was network-blocked. Do not announce open source in the narration until visibility is confirmed.
- Optional alternate evidence line, only if replacing another line: “In 2021, the FTC alleged that three brokers used methods including automated software to buy more than 150,000 tickets.” Keep its adjacent-market context; it is not an AI-agent loss estimate.
