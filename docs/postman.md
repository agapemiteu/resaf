# Postman contract checks

Import [the collection](https://resaf-api.onrender.com/postman.json) into Postman or run:

```sh
npx newman@6.2.1 run https://resaf-api.onrender.com/postman.json
```

The collection makes 12 real HTTP requests with 20 assertions: health, parking discovery, commitment/refund terms, rejection of unauthenticated actions, keyless demo session creation, empty initial history, merchant-policy protection, worker protection and cross-resource access rejection. It creates no reservation, model inference, payment, refund or policy change.

[Verified run #1](https://github.com/agapemiteu/resaf/actions/runs/42386090051) completed successfully on November 7, 2026: 12 requests, 20 assertions, zero failures. GitHub commit: `83cc684e022acdf2e825cef94517171aa8d1f363`. The observed average HTTP response time for this run was 84 ms; this is a single test run, not a performance guarantee.

The workflow runs when the collection or runner changes, and supports manual execution in GitHub Actions. It uploads a sanitized report containing request names, status codes and assertion outcomes. Headers, cookies and response bodies are excluded from that report. The repository is currently private, so the GitHub run links require access until it is made public for submission.

Source of runner behavior: [Postman's Newman documentation](https://learning.postman.com/docs/collections/using-newman-cli/installing-running-newman).
