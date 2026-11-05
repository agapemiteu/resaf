# Hackathon sponsor fit

The required combination is PayPal Sandbox and meaningful AI. Sponsor tools are optional. Resaf should use tools that strengthen its reservation infrastructure and one-resource demo.

| Sponsor | Resaf fit | Decision |
|---|---|---|
| Render | Host the app and PostgreSQL database in one platform. | Use for deployment. Keep expiration timestamps in Postgres and add a reliable reconciliation job once payment flows exist. |
| Postman | Publish and exercise the merchant-facing reservation API. | Add a collection after routes and authentication are stable. |
| APIMatic | Generate developer-facing SDK/docs from Resaf's OpenAPI contract and use its PayPal API context plugin. | Use after the API contract is stable; maintain one OpenAPI source. |
| Channel3 | External product discovery for shopping agents. | Skip for the one-product merchant demo; merchant catalog is authoritative. |
| AG Grid | Merchant analytics and dashboards. | Skip; a small event timeline explains the demo better. |
| Bryntum | Scheduling and booking timelines. | Skip for the one-product MVP. A changing commitment is a versioned pricing policy, not a scheduling UI. Revisit for time-slot inventory. |
| Elastic | Search and agent retrieval. | Skip; one product does not need a search cluster. |
| Kernel | Browser sessions for agents. | Skip for the API-first MVP. Browser automation may later help discovery on merchants without an API, but payment approval stays with the human. |
| Astropods | Hosted agent runtime. | Skip until agent deployment needs separate orchestration. |
| Zapier | Cross-app automation. | Skip; direct API calls keep payment and policy state auditable. |

Do not imply sponsor-prize eligibility from a logo or mention. A submission should show real use of any claimed tool. The Render sponsor page suggests using Render Workflows for agents or background jobs; evaluate that only after the core flow works.

## Merchant-controlled changes

A merchant may add a new immutable policy version with a higher commitment and an `effective_at` time. New approval claims select the latest effective version and copy its amount and terms into the reservation. A pending or active claim keeps the amount shown to its buyer. The agent can explain the quote or decline it; it cannot set the amount. The current implementation supports time-scheduled policy versions, not autonomous price optimization or mid-reservation increases.

Sources: [official hackathon rules](https://paypalaihackathon.devpost.com/rules), [Render sponsor page](https://paypalaihackathon.devpost.com/details/render), [Postman sponsor page](https://paypalaihackathon.devpost.com/details/postman), [APIMatic sponsor page](https://paypalaihackathon.devpost.com/details/apimatic), [Channel3 sponsor page](https://paypalaihackathon.devpost.com/details/channel3), and the other sponsor pages linked from the [hackathon overview](https://paypalaihackathon.devpost.com/).
