# MCP Audit

Pragmatic V1 implementation of the MCP Readiness Audit defined in [prd.md](/Users/yaya/Gizmo/mcp-audit/prd.md) and [audit-ruleset.md](/Users/yaya/Gizmo/mcp-audit/audit-ruleset.md).

## What it ships

- Public snapshot flow at `/` with inline scoring.
- Paid audit queue at `POST /api/audits`.
- 8-dimension scoring engine with roadmap and pricing output.
- Markdown, PDF, and XLSX exports.
- Local JSON persistence in `data/`.
- Optional Slack and HubSpot notifications via environment variables.

## Run it

```bash
npm install
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Test it

```bash
npm test
```

## Notes

- Snapshot mode uses public crawl data only.
- Paid audit mode accepts an optional Webflow read-only token; without one, the audit degrades gracefully and marks dimensions as partial/unavailable.
- HubSpot sync runs only for paid audits when `HUBSPOT_PRIVATE_APP_TOKEN` is set.
