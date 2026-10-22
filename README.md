# ScamShield

ScamShield is a prototype that helps a person organize a suspected scam report, analyze the submitted evidence, and decide whether more information or public-source research is needed. It uses separate LLM-backed n8n workflows for analysis, verification, search, and alert drafting. Search results are leads, not proof, and public alerts are guarded by verification and evidence checks.

**Live demo:** [https://scamshield-demo.duckdns.org/](https://scamshield-demo.duckdns.org/)

## What it does

- Accepts a report through the browser and sends it to the Phase 3 n8n controller.
- Runs the Analysis Agent, then routes its structured message and case patch to Verification.
- Can request more user evidence, hold or reject a case, request bounded Search, or route an eligible case to Alert.
- Searches Google News RSS for candidate public reporting.
- Requires verification approval and a publication guard before the optional Telegram workflow can send an alert.

The current report flow is synchronous. The frontend supports text fields; its screenshot picker only previews images locally and does not upload or analyze them. The public webhook triggers are not authenticated or rate-limited. Do not submit credentials, OTPs, payment PINs, or unnecessary personal information.

## Architecture

```text
Browser frontend
  ├── POST /webhook/scam-report-test ──> Phase 3 controller
  │                                       ├── Analysis Agent
  │                                       ├── Verification Agent
  │                                       ├── conditional Search + re-verification
  │                                       └── conditional Alert -> publication guard -> Telegram
  └── POST /webhook/scam-search ─────────> Search Agent -> Google News RSS + LLM
```

The four agents are n8n subworkflows that return structured messages and case patches. Phase 3 carries the current case state and selects the next workflow from the agent recommendation. Agents do not communicate peer-to-peer or maintain durable shared memory. n8n execution state is not a separate persistent ScamShield case database.

## Repository layout

| Path | Purpose |
|---|---|
| `frontend/` | Static HTML, CSS, and JavaScript browser interface. |
| `n8n/workflow/` | Current local n8n workflow exports, including the four agents and orchestrator. |
| `n8n/AZURE_WORKFLOW_SYNC.md` | Azure export provenance, workflow IDs, and safe re-import notes. |
| `schemas/` | JSON schemas for agent messages and case state. |
| `docker-compose.yml` | Local Docker stack: frontend, n8n, PostgreSQL, optional Ollama and Caddy profiles. |
| `render.yaml`, `vercel.json` | Alternative Render n8n and Vercel frontend deployment configuration. |
| `DEPLOYMENT.md` | Vercel + Render deployment and verification guide. |
| `ScamShield_Submission_Documents/` | CA3 synopsis, design, input/output definitions, and execution trace. |

## Run locally

1. Install Docker Desktop and start its engine.
2. Copy `.env.example` to `.env` and fill the required values: a unique `N8N_ENCRYPTION_KEY`, strong `POSTGRES_PASSWORD`, and compatible LLM provider key, model, and API URL. Keep `.env` private; it is excluded by `.gitignore`.
3. Start the stack:

   ```powershell
   docker compose up -d
   ```

4. Open the frontend at `http://localhost:8080` and n8n at `http://localhost:5678`.
5. Import workflows from `n8n/workflow/` into n8n. After import, link the Execute Sub-workflow nodes to the corresponding imported agent workflows, save, and activate only the routes you intend to use.

For local Ollama, configure an Ollama-compatible endpoint and start the optional profile with `docker compose --profile local-llm up -d`. For local HTTPS through Caddy, configure a DNS hostname in `TLS_HOSTNAME` and use `docker compose --profile edge up -d`. Provider deployment steps are in `DEPLOYMENT.md`.

## Workflow and endpoint status

The live homepage returned HTTP 200 when last checked on 2026-10-22. A historical report execution completed Analysis and Verification and returned `REQUEST_MORE_USER_EVIDENCE`; a separate historical Search execution selected one RSS candidate. These are separate runs. During the same review, a fresh public Search POST returned HTTP 500. The report endpoint was not re-tested then. A successful integrated Search/re-verification/Alert/Telegram cycle has not been verified.

See `ScamShield_Submission_Documents/ScamShield_Execution_Trace.md` for the redacted captured runs and limitations. Do not treat historical executions as proof that the endpoints currently work.

## Deployment

The deployment files describe a Vercel static frontend and Render n8n service with managed PostgreSQL and a persistent disk. The public demo URL above is observed, but its current hosting provider and production database/persistence configuration have not been independently verified. A Render persistent disk requires a paid service plan; review provider pricing before creating services. The n8n editor must use owner authentication and must not be exposed without access controls. Never put API keys, Telegram tokens, passwords, or `.env` values in Git or browser code.

## CA3 artifacts

The `ScamShield_Submission_Documents/` folder has the project synopsis, system design, input definition, output definition, and execution trace. The trace is genuine but limited: its report fixture was synthetic, and it documents only the Analysis-to-Verification path. Upload the artifacts through the course Project Artifacts page and register each active member's GitHub username there.
