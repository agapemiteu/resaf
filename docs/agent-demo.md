# Live agent demonstration

The primary screen accepts a shopping goal and displays actual persisted model function calls as they complete. This is an observation trail, not generated private reasoning or a scripted animation. Try asking the agent to inspect terms only, reserve while you decide, or arrange a booking and request payment consent. The agent discovers resources, chooses structured tools, and uses real HTTP responses.

After verified commitment payment, the server resumes the agent with its observed reservation. A competing agent can wait and resume when inventory becomes available. Policy denials terminate prohibited retries. PayPal-hosted consent remains required in this demo.

The optional business agent observes paid holds, unpaid attempts and purchases in the configured window. The model recommends a permitted raise, lower, or keep action. Server code enforces demand conditions, step, bounds, cooldown, immutable versions and accepted refund terms. Model failures preserve the previous quote. `business_agent_decisions` records observations and model responses; the verified trail exposes them. This does not enable an AI to change refund promises or spend buyer money.

A purchased reservation can return an authenticated `/api/v1/reservations/{id}/receipt`. The server rechecks its PayPal capture ID, completed status, amount and currency. The confirmation separately shows final payment, commitment collected, confirmed refunds and settlement status. It is printable, labelled Sandbox and does not pretend to be a real parking ticket or hotel integration. No receipt is issued for an unpaid reservation.

Inference defaults to `gemini-3.1-flash-lite`. If Gemini returns a temporary quota/server error and `GROQ_API_KEY` is configured, the same observed tool history is sent to Groq (`openai/gpt-oss-20b` by default). Records identify the actual provider/model for each executed tool. Groq reference: https://console.groq.com/docs/tool-use/overview and https://console.groq.com/docs/api-reference.
