# Phase 2 n8n Implementation

Import these workflows into the same n8n instance as Phase 1:

- `workflows/phase2-verification-agent.json` — Verification Agent
- `workflows/phase2-scam-alert-agent.json` — Scam Alert Agent
- `workflows/phase2-controller.json` — safe manual controller/demo

Both use **When Executed by Another Workflow** with **Input data mode: Accept all data**. They expect the Phase 1 JSON envelope:

```json
{
  "case_state": {"case_id": "SCAM-001", "state_version": 1, "sources": [], "evidence": [], "analysis": {}, "agent_history": []},
  "incoming_message": {"objective": "Verify this report."}
}
```

## Verification Agent

Call it after the Analysis Agent. It returns `{ case_id, message, case_patch }` and never calls Telegram. Route its `message.recommended_action` in the Phase 3 controller:

| Action | Route |
| --- | --- |
| `SEND_TO_SEARCH` | Scam Search Agent, then return its patch to Verification |
| `REQUEST_MORE_USER_EVIDENCE` | Intake/user evidence collection |
| `KNOWN_SCAM_CONFIRMED` | User response plan; do not treat this as a public alert |
| `SEND_TO_ALERT` | Scam Alert Agent |
| `HELD_FOR_REVIEW`, `ESCALATE`, `CLOSE_CASE` | Stop automated publication |

It limits research and user-evidence loops to two by default. Override those using `max_research_count` or `max_revision_count` in the input envelope.

## Scam Alert Agent

Call it only after the Verification patch has been merged into `case_state`. The deterministic gate requires all of:

- `case_state.verification_status === "APPROVED"`
- `case_state.verification.publication_eligible === true`
- one or more verification-approved evidence IDs

Otherwise it returns `ALERT_REVISION`. A valid draft can return `ALERT_APPROVED`, but it still **does not publish anything**. Phase 3 must enforce its own Telegram guard: Verification must be approved and publication-eligible, and Alert must return `ALERT_APPROVED` with `APPROVE_ALERT`.

## Local Ollama

The HTTP nodes use `OPENAI_API_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL` from `.env`. On current n8n, configure the HTTP node body as **Using JSON** and retain the supplied 180000 ms timeout for a local CPU model.

## Controller setup

Import the controller after the four agent workflows. Its four **Execute Sub-workflow** nodes must be selected manually after import:

| Controller node | Choose this workflow |
| --- | --- |
| `Invoke Verification Agent` | `Phase 2 - Verification Agent` |
| `Invoke Re-verification Agent` | `Phase 2 - Verification Agent` |
| `Invoke Scam Search Agent` | `Phase 1 - Scam Search Agent` |
| `Invoke Scam Alert Agent` | `Phase 2 - Scam Alert Agent` |

Save the controller, then run **Phase 2 - Verification and Alert Controller**. It verifies the demo case, performs one research round only when Verification requests it, then calls Alert only when Verification returns `SEND_TO_ALERT`. It ends at **Show Phase 2 Decision** and never sends Telegram messages.
