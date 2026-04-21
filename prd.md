# MCP Readiness Audit — Product Requirements Document

**Version:** v0.1 (draft)
**Owner:** Yaya (CGO) + Collin (VP Growth) + WAIO eng team
**Last updated:** 2026-04-17
**Status:** Pre-build — for alignment before scoping

---

## 1. Problem & Opportunity

### The shift
Webflow shipped an MCP server enabling Claude to read and write to live Webflow sites. Marketing teams can now say "audit all pages for missing alt text" or "publish a new case study from this brief" and have it executed by an agent rather than by a developer working from a ticket.

### The gap
Most Webflow sites in production today are not built for agentic operations. They were built for humans clicking through the Designer. The same site that works fine for a marketer in the UI fails for Claude:

- Auto-named classes (`div-block-47`) make Claude guess at intent
- Copy-pasted divs instead of components mean a "fix the CTA" prompt only fixes one of forty
- Hardcoded colors mean "change brand color" requires hunting across hundreds of declarations
- Flat CMS schemas mean Claude can dump content into a collection but can't relate it to anything else
- Missing alt text and unhelpful asset names mean Claude can't pick the right image when prompted

### The opportunity
Every Webflow customer who wants to use Claude through MCP will discover this gap on day one. They'll either:
- Try MCP, get frustrated by inconsistent results, blame Claude (not the site), and quit
- Pay someone to refactor their site to be MCP-ready

We want to be the someone.

### Why now
- April 28, 2026 — VAN co-hosts MCP Masterclass with Webflow's Sr. Dev Evangelist Raymond Camden. We have an audience of CMOs, VPs Marketing, and Heads of Web actively interested in this exact thing.
- Webflow's own marketing positions MCP for "audit content, fix metadata, refactor CSS to design variables" — these are the *symptoms* of MCP-unready sites, which means the gap is publicly named already.
- VAN currently lacks a productized AI/MCP offering. This is the first one.
- No competitor has shipped an MCP readiness audit yet (as of 2026-04-17). First-mover window.

### Business value
- **Sales velocity:** Concrete, priced offer for cold outbound and existing-client expansion
- **Event monetization:** Turns the masterclass from thought leadership into pipeline
- **Category positioning:** Establishes VAN as the agentic-web specialist before Big Agency wakes up
- **Recurring follow-on:** Audit → implementation → ongoing optimization retainer
- **Asset reuse:** Engine extends WAIO infrastructure (we already own the audit-engine pattern)

---

## 2. Target Users

### Buyer
- **CMO / VP Marketing / Head of Growth** at B2B SaaS or fintech (200-500 employees)
- Marketing owns the website
- Already on Webflow (Enterprise or Pro+)
- Has at least one of:
  - Mandate to "do something with AI" from CEO/board
  - Pain point: dev team is a bottleneck for site changes
  - Budget pressure: "we shouldn't need a dev for every metadata fix"

### Champion / user
- **Head of Web** or **Webflow operator** inside the marketing team
- Will run Claude/MCP day-to-day after implementation
- Cares whether the audit is technically credible (it's their tools we're scoring)

### Decision-influencer
- **Engineering** (rarely) — if the marketing team needs IT to provision the API token. Usually low-friction (read-only token).

### Disqualifications
- Not on Webflow (out of scope, period)
- Site is < 10 pages (probably not worth a full audit; manual hour will do it)
- Marketing doesn't own the site (sell to whoever does)
- No interest in or active block on AI tooling adoption

---

## 3. User Journey

### Cold prospect → audit → implementation

```
[Awareness] LinkedIn / Cold email / Event registration
   ↓
[Free Snapshot] Submit URL → instant top-line score → "you're 65% ready"
   ↓ (drives curiosity)
[Engagement] Discovery call — see the snapshot, learn the methodology
   ↓
[Paid Audit] Provision read-only API token → 24-48hr deep audit
   ↓
[Roadmap] Detailed report + scoped + priced implementation
   ↓
[Implementation] 1-8 weeks Webflow refactor depending on band
   ↓
[Optional retainer] Ongoing optimization + prompt iteration
```

### Existing client expansion

```
[Existing engagement] Active project or recent close
   ↓
[Internal upsell] "Now that we built it, let's make it agentic"
   ↓
[Paid Audit] Skip snapshot, go direct (we already have token)
   ↓
[Implementation] Standard flow
```

### Event-driven

```
[Event registration] Includes opt-in for free snapshot
   ↓
[Pre-event email] "Your snapshot is ready" — gets them invested
   ↓
[Event] Methodology + live walkthrough
   ↓
[Post-event email sequence] Audit CTA, audit-fee-credit hook, calendly link
   ↓
[Paid Audit → Implementation] Standard flow
```

---

## 4. Product Surface

Three surfaces, one engine:

### Surface 1 — Free Snapshot (web tool)
- Public-facing form: paste URL, hit go
- Runs URL-derivable subset of audit checks (~3 of 8 dimensions)
- Renders single-page result inline (~30 seconds)
- Single CTA: "Unlock the full audit"
- Lives on `vezanetwork.com/mcp-snapshot` (or similar)
- Identical engine pattern to WAIO

### Surface 2 — Paid Audit (full report)
- Authenticated user dashboard
- Token entry form with scope guidance + revocation instructions
- Async run (24-48hr SLA)
- Output: branded PDF + dashboard view + Markdown export + Excel issue list
- Same UI shell as WAIO (history, downloads, sharing)

### Surface 3 — Implementation Engagement (services)
- Triggered post-audit, scoped from audit findings
- Banded pricing computed from estimated hours (Light / Medium / Heavy / Foundational)
- Standard VAN SOW (subtractive template, 70/30 payment split)
- Optional ongoing optimization retainer post-launch

---

## 5. Functional Requirements

### Must-have (V1, ships for the April 28 event)

**Snapshot tool**
- Public URL form (no auth)
- URL validation + Webflow detection
- Runs Style Tokenization, SEO Completeness, lightweight Class Hygiene checks (URL-only data)
- Generates score (0-100) and top 3 issues
- Inline result + email-capture for full report
- Tracks conversion to paid audit signup

**Paid audit engine**
- Token intake + scope verification
- Webflow API client with rate limit handling
- All 8 dimension scorers (per `audit-ruleset.md`)
- Graceful degradation if scopes insufficient (mark "partial," score what's available)
- Async job queue (24-48hr SLA)
- Storage of historical audits per account

**Report output**
- Branded PDF (VAN design system: Geist Sans/Mono, VAN Cyan #6EFFFF, dark bg #0D121C)
- Section structure per `audit-ruleset.md` §8
- Markdown + Excel export
- Email delivery + dashboard view

**Sales integration**
- Audit completion triggers HubSpot deal creation (associated with contact + company)
- Audit-fee credit logic baked into pricing logic (100% credit if implementation signed within 30 days)
- Slack notification to #van-growth on each completed audit

### Should-have (V1.1, within 30 days post-event)

- Account dashboard with audit history
- Re-audit feature (track score changes over time after implementation)
- Multi-locale audit support
- Custom scoring weight overrides (for sales conversations: "let me show you what your score would look like if we weighted X more heavily")

### Nice-to-have (V2)

- Embedded snapshot widget (partner sites can embed our snapshot — distribution play)
- Webflow App Store listing
- API for partners (Webflow agencies can resell our audit)
- Auto-remediation preview ("here's what Claude would do if connected — fix 47 alt tags right now")
- Multi-CMS support (extend beyond Webflow once Anthropic ships native MCP servers for other CMSes)

### Out of scope (V1)
- Setting up the customer's Claude account, Claude Pro/Max, or MCP server connection (customer's responsibility)
- Webflow site refactoring itself (that's the implementation engagement, separate workflow)
- Governance/access controls (Webflow + Claude handle this at platform level)
- Multi-platform (Wordpress, Sanity, Contentful) — Webflow only at launch
- Free monthly recurring re-audits (manual re-run only)

---

## 6. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| **Snapshot latency** | < 60 seconds end-to-end |
| **Paid audit SLA** | 24-48 hours from token submission to delivered report |
| **Concurrent audits** | Support 10 in-flight audits at V1 launch; horizontal scale path defined |
| **Webflow API resilience** | Backoff + retry on 429s, graceful 403/409 handling, no audit failures from transient errors |
| **Token security** | Tokens stored encrypted at rest, scoped read-only, deletable post-audit, never logged |
| **Brand consistency** | All output matches VAN design system; PDF generation tested on letter + A4 |
| **Accessibility** | Snapshot tool is WCAG AA |
| **Analytics** | Funnel tracking from snapshot → paid audit → implementation; reported in HubSpot |

---

## 7. Pricing & Packaging

| Step | Price | Timeline | What you get |
|---|---|---|---|
| Free Snapshot | $0 | 30 sec | Top-line score, top 3 issues |
| Paid Audit | $1,500-$2,500 *(TBD)* | 24-48 hrs | Full 8-dimension scoring, detailed findings, scoped + priced implementation roadmap |
| Implementation — Light | $5K-$10K | 1-2 wks | < 60 hrs of refactor work |
| Implementation — Medium | $10K-$25K | 3-4 wks | 60-150 hrs |
| Implementation — Heavy | $25K-$50K | 5-8 wks | 150-300 hrs |
| Implementation — Foundational | $50K+ | Custom | 300+ hrs / partial rebuild |

**Audit fee credit:** 100% credited toward implementation if signed within 30 days.

**Payment terms (implementation):** Standard VAN 70/30 split.

**Bundle option:** "Audit + Light Implementation" combo at 10% off — used as a closing accelerator.

### Pricing rationale
- Audit price is set to be a low-friction qualifier (impulse-buy at VP Marketing budget level), not a profit center
- Audit fee fully credits to remove the "I paid twice" objection
- Implementation bands are anchored to standard VAN $175/hr blended rate (per existing pricing memory)
- Light tier overlaps with WAIO at $5K — natural cross-sell path

### Audit pricing decision needed
$1,500 vs $2,500 — depends on positioning:
- **$1,500** — closer to impulse-buy, higher conversion %, signals "diagnostic"
- **$2,500** — signals more depth, filters tire-kickers harder, anchors implementation pricing higher

Recommend: start at $2,500 with a 30-day "event attendee" discount to $1,500. Test both.

---

## 8. Technical Architecture (high-level)

```
┌───────────────────────────────────────────────────┐
│  Frontend: vezanetwork.com/mcp-snapshot           │
│  + Account dashboard (audit history, downloads)   │
└────────────────┬──────────────────────────────────┘
                 │
                 ↓
┌───────────────────────────────────────────────────┐
│  API: /audit (POST start, GET status, GET result) │
│  Auth: anonymous for snapshot, account-scoped     │
│        for paid audit                              │
└────────────────┬──────────────────────────────────┘
                 │
                 ↓
┌───────────────────────────────────────────────────┐
│  Audit Engine                                      │
│  ├─ Webflow API Client (rate-limited, retried)    │
│  ├─ URL Crawler (CSS, HTML, sitemap)              │
│  ├─ 8 Dimension Scorers (per ruleset)             │
│  ├─ Issue Generator                                │
│  ├─ Recommendation Mapper                          │
│  ├─ Roadmap + Pricing Calculator                   │
│  └─ Report Renderer (PDF / MD / XLSX)             │
└────────────────┬──────────────────────────────────┘
                 │
                 ↓
┌───────────────────────────────────────────────────┐
│  Storage: Postgres (audits, accounts, results)    │
│  + S3-equiv (rendered PDFs, raw API responses)    │
└───────────────────────────────────────────────────┘
                 │
                 ↓
┌───────────────────────────────────────────────────┐
│  Integrations                                      │
│  ├─ HubSpot (deal creation, contact updates)      │
│  ├─ Slack (#van-growth notifications)             │
│  └─ Email (report delivery, follow-up sequence)   │
└───────────────────────────────────────────────────┘
```

### Reuse from WAIO
- Audit engine shell, job queue, async runner pattern
- Report renderer (PDF + MD + XLSX outputs)
- Frontend dashboard pattern (history, downloads, sharing)
- HubSpot/Slack integration plumbing
- Brand styling

### Net-new build
- Webflow API client (~1 wk)
- 8 dimension scorers (~2 wks)
- Recommendation mapper + roadmap calculator (~1 wk)
- Snapshot URL crawl path (~3 days)
- Token vault + scope verification (~3 days)
- New report template (~1 wk)

**Engineering estimate:** ~6 weeks for MVP, parallel-buildable across 2 engineers → ~3-4 weeks calendar time.

---

## 9. Phased Roadmap

### Pre-event (now → Apr 28)
- Land this PRD + audit ruleset
- 30-min validation call with Raymond Camden
- WAIO team scoping review
- Write event copy that previews the snapshot tool ("we'll send you a snapshot in your event confirmation email")
- Manual MVP audit prepared so we have something to demo even if engine isn't shipped

### V1 launch (Apr 28 → May 15)
- Snapshot tool live before May 1
- Paid audit engine live by May 8 (manual audits offered in interim with "concierge" framing)
- Post-event email sequence wired with snapshot CTA
- Sales briefing for Collin + Cat
- First 5 paid audits run with white-glove support to validate scoring model

### V1.1 (May 15 → Jun 30)
- Multi-locale support
- Account dashboard refinement
- Audit history + score-over-time
- First case study published (audit → implementation → result)

### V2 (Q3+)
- Webflow App Store listing
- Embeddable snapshot widget for partner distribution
- Multi-CMS (if Anthropic ships MCP servers for others)
- Auto-remediation preview ("see what Claude would do")

---

## 10. Success Metrics

### Snapshot funnel (V1, first 90 days)
- 500 snapshots run
- 25% conversion: snapshot → discovery call booked (125 calls)
- 20% conversion: call → paid audit signed (25 audits)
- 50% conversion: audit → implementation signed (12 implementations)

### Revenue (V1, first 90 days)
- Audits: 25 × $2,000 avg = **$50K**
- Implementations: 12 × $20K avg = **$240K**
- Total: **~$290K** in 90 days post-event

### Pipeline contribution (V1, first 90 days)
- $750K+ qualified pipeline created (defined as audit-completed + discovery-call-completed)
- Direct contribution to VAN's Q2 $600K target

### Sales motion metrics
- 5+ sales reps (Collin, Cat, Yaya, Stefan, Jordan-as-AI-SDR) trained and pitching
- Average sales cycle: < 30 days from audit completion to implementation signed
- < 5% audit refund rate (signal that pricing/value is correctly matched)

### Brand metrics (V1, first 90 days)
- 1 case study published showing measurable post-implementation MCP improvement
- 3+ inbound enterprise enquiries citing the audit as the entry point
- 10+ unsolicited LinkedIn mentions / shares of the snapshot tool

---

## 11. Open Questions / Risks

### Open questions
1. **Audit fee:** $1,500 or $2,500 launch price? (Lean: $2,500 with $1,500 event-attendee discount.)
2. **Engine reuse %:** WAIO team to confirm what's forkable vs requires new build.
3. **Concierge fallback:** If automated engine isn't ready by Apr 28, do we run manual audits at the same price? (Probably yes — better signal than waiting.)
4. **Multi-locale weighting:** Average across locales, or score primary only? (Decision needed before V1.)
5. **Public visibility:** Is the snapshot tool indexable by Google / cited by AI search engines? (Probably yes — programmatic-SEO play, free-tool-strategy hybrid.)

### Risks
- **Webflow ships their own readiness checker** — likelihood: medium. Mitigation: ours is more opinionated and tied to a service offering, theirs would be a generic widget. Be first.
- **API scope changes** — likelihood: low. Mitigation: graceful degradation already designed in.
- **Low post-event conversion** — likelihood: medium for first event. Mitigation: 90-day window for follow-up sequence; reuse same offer for outbound.
- **Engine not ready in time** — likelihood: medium. Mitigation: manual concierge audit pre-built, same price, same deliverable structure.
- **Audit reveals competitor positioning** — likelihood: low. The audit is opinionated about *how to build for MCP* — that opinion is itself the differentiator. Even if competitors copy the format, our methodology + service model is the moat.

---

## 12. Sales & Go-to-Market

### Channels
- **Event** (April 28 MCP Masterclass) — primary launch channel
- **Outbound** (Jordan-led ABM motion) — snapshot URL as opener: "Ran your site through our MCP Readiness Snapshot, want to see the result?"
- **Existing client expansion** — every active client gets pitched within 30 days of launch
- **Partner distribution** (V1.1+) — Webflow agencies, Webflow itself, complementary tools

### Positioning
**One-liner:** Get your Webflow site ready for Claude — without guessing what to fix.

**Elevator:** Webflow shipped MCP, but most sites aren't built for an AI to operate. We score your readiness, then refactor what needs fixing. You go from "MCP demo doesn't work for us" to "our team is shipping changes through Claude" in weeks.

**Three-line proof:**
1. Built the audit engine ourselves (we already run WAIO at scale).
2. Co-hosting the launch event with Webflow's Sr. Dev Evangelist.
3. Scored 50+ Webflow sites in beta (target — fill in once true).

### Sales briefing artifacts (downstream)
- One-pager (PDF)
- Discovery call script
- Pricing/objection cheat sheet
- Demo script (live snapshot run on prospect's URL during call)
- Email templates (cold open, post-snapshot follow-up, post-audit follow-up)

---

## 13. Definition of Done (V1 launch)

- [ ] Snapshot tool live at vezanetwork.com/mcp-snapshot
- [ ] Paid audit engine live with all 8 dimensions scoring
- [ ] PDF + Markdown + Excel report outputs validated against 3 reference sites
- [ ] HubSpot integration: completed audits create deals + contacts
- [ ] Slack notification on each completed audit to #van-growth
- [ ] Pricing page live (or one-pager equivalent)
- [ ] Sales briefing distributed to Collin + Cat + Stefan
- [ ] Post-event email sequence (3 touches) wired
- [ ] First 5 paid audits run with white-glove support
- [ ] Case study pipeline started — first implementation underway
