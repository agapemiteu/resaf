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

## Positioning

Lead with: **Resaf � an AI reservation agent for businesses, backed by PayPal.**

The agent coordinates reservation and commitment workflows; the API is how businesses and other agents integrate it. Merchant policies and financial verification remain enforced by deterministic server code. This framing does not imply a new generic shopping assistant or unattended buyer payments.

CrawlerPal precedent: [PayPal calls it a paywall AI agent assistant](https://developer.paypal.com/community/blog/winners-dev-days-hackathon/); its [repository](https://github.com/positiveblue/CrawlerPal) implements a server, payment offers, and a programmatic client. Agent-facing presentation and reusable infrastructure coexist.

## Stronger U.S. pain evidence

- [The Atlantic, July 1, 2024](https://www.theatlantic.com/technology/archive/2024/07/restaurant-reservation-resy-tock-american-express/678862/): reported one New York steakhouse lost $10,000 in one night through cancellations/no-shows in a bot-problem context. This is a reported individual case, not an audited industry total or an LLM-agent loss estimate.
- [National Restaurant Association, April 24, 2025](https://restaurant.org/research-and-media/media/press-releases/access-denied-the-rise-of-black-market-reservations-disrupting-the-restaurant-dining-experience/): Monteverde co-owner Rob Mosher describes guests encountering no availability and believing they cannot get a table. Commander's Palace general manager Steve Woodruff describes resale making dining more expensive and frustrating.
- [Morning Consult polling memo](https://restaurant.org/getmedia/0ae539a9-dad8-4cf4-8be6-b50f6fc8f8fb/Restaurant-Reservation-Polling-Memo.pdf): 2,200 U.S. adults, August 16�18, 2024; 72% concerned reservation resale puts restaurants out of reach; 70% concerned about financial harm through no-shows. These are opinions, not observed victim counts.
- [New York Governor's announcement, December 19, 2024](https://www.governor.ny.gov/news/bon-appetit-governor-hochul-signs-legislation-cracking-down-black-market-restaurant): legislation followed unauthorized resale problems. The NYC Hospitality Alliance described lost money for businesses and workers when reservations do not sell and tables go empty. Use as dated context; do not claim legislation or deposits solve every form of abuse.
- Resy's 4� no-show and 2� late-cancellation evidence above remains the main comparative figure. Traditional bot abuse predates current LLM agents; agentic shopping increases the relevance of the problem, not proof of its entire economic cause.

## Revised narration and shot list

### 0:00�0:17 � Human pain
Visual: original available/held/empty-table illustration. Caption: �Unavailable online. Empty in person.� Clearly an illustration.

> A customer cannot get a table. The restaurant has empty seats. A bot reserved them, hoping to sell the booking. If nobody buys, the customer misses dinner�and the restaurant loses the sale.

### 0:17�0:39 � Dollars and measured behavior
Visual: separate $10,000 reported-case and 4� relative-rate cards, each with date/source. Never combine them into a claimed industry loss.

> The Atlantic reported a New York steakhouse losing ten thousand dollars in one night from cancellations and no-shows. Resy's own data found bot and broker bookings had four times the no-show rate of ordinary users. Faster AI agents make repeated holds easier to automate.

### 0:39�0:57 � Agent-first introduction
Visual: Resaf + one-line positioning. Move straight into running application and accepted terms.

> Meet Resaf: an AI reservation agent for businesses, backed by PayPal. It coordinates temporary reservations with a financial commitment. Businesses control the price, deadline, repeat limits, and what gets refunded. Access has responsibility; completing the booking can earn the commitment back.

### 0:57�1:20 � Actual competition
Visual: Run, actual model-selected HTTP tools, then AG Grid's real contention outcomes. No predetermined winner.

> Here, two real AI shoppers compete for one parking space. They discover it, inspect the policy, and request access. One receives a short checkout claim. The other waits. These are actual model-selected tool calls and server responses. A claim becomes a paid reservation only after verified payment.

### 1:20�1:40 � PayPal financial proof
Visual: actual Sandbox commitment approval/capture and reserved state. Label edited login/wait time.

> The buyer approves a two-dollar commitment in PayPal Sandbox. Resaf verifies the payment, records its transaction ID, and activates the timed reservation. Payment approval is explicit. Repeated holds cannot bypass the business rules simply by changing an agent's name.

### 1:40�2:00 � Adaptation and unhappy paths
Visual: real Business bounds; genuine denial/recovery status. Do not fabricate automatic price decisions. Label any failure drill as simulated.

> The business agent can recommend higher or lower commitments within approved bounds. Accepted prices and refund promises stay fixed. If another buyer owns the space, our shoppers wait. If a tool fails, the run stops safely and flags the business. Expired holds release automatically.

### 2:00�2:28 � Verified outcome
Visual: separate $25 PayPal purchase; confirmed $2 refund; actual Sandbox receipt. Same round throughout. Leave space for amounts to be read.

> Now the buyer completes the separate twenty-five-dollar booking. PayPal confirms payment. The resource becomes sold. This policy refunds the full two-dollar commitment, and the receipt shows the verified outcome. One successful buyer. No double booking. A financial trail the business can inspect.

### 2:28�2:50 � Integration and close
Visual: live API request/response, then original parking/room/table symbols as potential applications. End card with Resaf and tagline.

> Businesses connect Resaf through its API to their own inventory and checkout. Today we demonstrate parking; the same approach could support rooms, tables, and scarce products. Resaf makes temporary access financially accountable, while keeping legitimate agent bookings possible. Information is free. Scarcity isn't.

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
