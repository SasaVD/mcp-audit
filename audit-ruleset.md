# MCP Readiness Audit — Ruleset & Scoring Rubric

**Version:** v0.1 (draft)
**Owner:** Yaya / WAIO eng team
**Last updated:** 2026-04-17
**Status:** Spec — not yet built

---

## 1. Purpose

Score how ready a Webflow site is to be operated by Claude through the Webflow MCP server. Output is a quantified readiness score, a ranked issue list, and a scoped implementation roadmap with priced bands.

This audit is **not** an SEO/AEO audit (that's WAIO). It measures *Claude's ability to safely write to the site*, not the site's ability to be read by AI.

---

## 2. Data Sources

### Primary: Webflow Data API (token required)
Read-only token scopes needed:
- `sites:read`
- `pages:read`
- `cms:read`
- `assets:read`
- `components:read` (where available)
- `custom_code:read` *(higher scope tier — request if available, fall back gracefully if not)*

### Endpoints used

| Endpoint | Purpose | Required for |
|---|---|---|
| `GET /v2/sites` | Site list, plan tier, locales | Bootstrap |
| `GET /v2/sites/:id` | Site metadata | Context |
| `GET /v2/sites/:id/pages` | Page inventory + SEO/OG fields | Pages, SEO dimensions |
| `GET /v2/pages/:id/dom` | Per-page node tree, classes, component refs | **Critical** — Class hygiene, components, empty divs |
| `GET /v2/sites/:id/collections` | CMS collection list | CMS dimension |
| `GET /v2/collections/:id` | Collection schema (fields, types, validations) | **Critical** — CMS dimension |
| `GET /v2/sites/:id/components` | Component library inventory | Component dimension |
| `GET /v2/sites/:id/assets` | Asset inventory + alt text + filenames | Asset dimension |
| `GET /v2/sites/:id/custom_code` | Site-level custom code injections | Custom code dimension *(graceful fallback)* |
| `GET /v2/sites/:id/registered_scripts` | Registered third-party scripts | Custom code dimension *(graceful fallback)* |

### Secondary: Public URL crawl (no token)
Used for the **Free Snapshot** tier and to enrich the paid audit. Verifies what's actually shipping.

- Compiled CSS (extract CSS variables, count unique hex codes, count unique font sizes)
- Rendered HTML (verify class names actually emitted match Designer)
- `sitemap.xml` (page architecture sanity check)
- `robots.txt`
- Style guide page probe (`/style-guide`, `/styleguide`, `/sg`, `/design-system`)
- Third-party script detection (HubSpot, Marketo, Intercom, GTM, etc.)

### Fallback strategy
- If a scope returns 403 → mark dimension "partial," score what's available, flag the gap in the report
- If forms endpoint returns 409 (needs republish) → infer form presence from DOM
- If site not yet published → score from API only, no public crawl, mark snapshot section "unavailable"

---

## 3. Scoring Dimensions

Eight weighted dimensions, each scored 0-100. Overall score is weighted sum.

| # | Dimension | Weight | What it measures |
|---|---|---|---|
| 1 | Class Naming Hygiene | **20%** | Can Claude reason about element intent from class names? |
| 2 | Component Adoption | **18%** | Will Claude's changes propagate, or require N×fixes? |
| 3 | CMS Schema Maturity | **18%** | Can Claude reason relationally about content? |
| 4 | Style Tokenization | **12%** | Can Claude make global style changes atomically? |
| 5 | SEO + Metadata Completeness | **10%** | Can Claude productively run audit/fix workflows? |
| 6 | Asset Hygiene | **8%** | Can Claude pick the right image when prompted? |
| 7 | Page Architecture | **8%** | Is the site organized for safe agent operations? |
| 8 | Custom Code Footprint | **6%** | How much of the site is outside MCP's reach? |
| **Total** | | **100%** | |

---

### Dimension 1 — Class Naming Hygiene (weight 20%)

**Why it matters:** When a marketer prompts "make the primary button red," Claude scans for elements whose class names suggest *primary button*. If everything is `div-block-47`, Claude has to guess (or visually inspect every node). Semantic class names are the single biggest predictor of MCP success.

**Data source:** Page DOM endpoint, parsed `class` attributes from every `text` and `block` node across all pages.

**Auto-name patterns to flag (regex):**
```
^div-block(-\d+)?$
^text-block(-\d+)?$
^link-block(-\d+)?$
^image(-\d+)?$
^section(-\d+)?$
^container(-\d+)?$
^heading(-\d+)?$
^paragraph(-\d+)?$
^button(-\d+)?$
^block(-\d+)?$
^column(-\d+)?$
^row(-\d+)?$
```

**Checks:**
1. **Semantic class ratio** — `(non_auto_named_classes / total_classes) × 100`
2. **Class reuse density** — `(total_class_instances / unique_classes)`. Higher = more reuse, healthier system.
3. **Naming convention detection** — bonus if BEM (`block__element--modifier`), utility (`u-`/`util-` prefix), or CC (`cc-`) patterns detected
4. **Singleton class flag** — count of classes used exactly once (high count = signals one-off styling)

**Scoring formula:**
```
base = semantic_ratio × 100
reuse_bonus = min(20, (avg_reuse_density - 1) × 4)
convention_bonus = 5 if naming_convention_detected else 0
singleton_penalty = max(-15, -singleton_count / total_classes × 30)

score = clamp(0, 100, base + reuse_bonus + convention_bonus + singleton_penalty)
```

**Issue thresholds:**
- semantic_ratio < 30% → **Critical**: "Class names are mostly auto-generated. Claude cannot reason about element intent."
- semantic_ratio 30-60% → **High**: "Significant share of auto-named classes. Claude will require visual inspection or guessing for ~N% of elements."
- semantic_ratio 60-80% → **Medium**
- semantic_ratio ≥ 80% → no issue

---

### Dimension 2 — Component Adoption (weight 18%)

**Why it matters:** A button changed inside a component updates everywhere it's used. A button copy-pasted as raw divs requires N edits and Claude is statistically guaranteed to miss one. Component adoption is the difference between "fix the CTA" being one prompt or 47 prompts.

**Data source:** `/components` (count + metadata) + `/pages/:id/dom` (count `type: component-instance` nodes per page).

**Checks:**
1. **Components defined** — total count
2. **Instance density per page** — `component_instances / total_nodes` (averaged)
3. **Reuse depth** — `total_instances_across_site / total_components`
4. **Pages with zero components** — flag (likely templates that should be componentized)
5. **Component naming quality** — same auto-name detection as dimension 1, applied to component names

**Scoring formula:**
```
density_score = min(100, avg_instance_density × 200)   # 50% density caps at 100
reuse_score = min(100, avg_reuse_depth × 10)           # 10 instances/component caps at 100
coverage_score = (1 - pages_with_zero_components / total_pages) × 100
naming_score = % of components with semantic names × 100

score = (density_score × 0.35) + (reuse_score × 0.30) + (coverage_score × 0.20) + (naming_score × 0.15)
```

**Issue thresholds:**
- 0 components defined → **Critical**: "No components in use. Every change must be applied N times."
- avg_instance_density < 5% → **High**
- pages_with_zero_components > 50% → **High**

---

### Dimension 3 — CMS Schema Maturity (weight 18%)

**Why it matters:** When a marketer says "publish a new case study and link it to the relevant industry page," Claude needs typed fields, validations, and reference relationships to do this without hallucinating. A "blog" collection with `Title (PlainText)` + `Body (RichText)` + nothing else is a write-only sink. Claude can dump content in but cannot navigate, query, or relate.

**Data source:** `/collections` + `/collections/:id` (full schema with field types and validations).

**Field types we care about** (from observed Webflow API): `PlainText`, `RichText`, `Image`, `MultiImage`, `Video`, `Link`, `Email`, `Phone`, `Number`, `DateTime`, `Switch`, `Color`, `Option`, `Reference`, `MultiReference`, `File`, `Price`, `SkuValues`.

**Checks:**
1. **Field type diversity** — count distinct types per collection (more types = richer schema)
2. **Reference field density** — `(reference_fields + multi_reference_fields) / total_fields`
3. **Required field discipline** — % of fields marked `isRequired: true`
4. **Validation presence** — % of fields with `validations` object populated
5. **Slug field present** — every collection should have a slug (most do by default)
6. **Reference target resolution** — check that all reference field `validations.collectionId` actually resolves to an existing collection
7. **Singular/plural alignment** — `displayName` and `singularName` differ in expected ways
8. **Help text presence** — % of fields with `helpText` populated (great signal for AI prompts — Claude reads helpText for context)

**Scoring formula:**
```
diversity_score = min(100, avg_field_types_per_collection × 15)
reference_score = min(100, ref_density × 200)            # 50% reference density = 100
required_score = required_field_pct × 100
validation_score = validation_presence_pct × 100
helptext_score = helptext_pct × 100
broken_ref_penalty = -broken_refs × 5

score = clamp(0, 100,
  diversity_score × 0.20 +
  reference_score × 0.25 +
  required_score × 0.15 +
  validation_score × 0.15 +
  helptext_score × 0.25 +
  broken_ref_penalty
)
```

**Issue thresholds:**
- 0 reference fields across any collection → **High**: "No relational structure. Claude cannot link content across collections."
- helptext_pct < 20% → **Medium**: "Few fields have help text. Claude lacks context when populating new items."
- any broken reference → **Critical**

---

### Dimension 4 — Style Tokenization (weight 12%)

**Why it matters:** "Change the brand color to teal" should be one MCP call modifying a single CSS variable. Without tokens, it's a hunt across 200+ inline color declarations.

**Data source:** Compiled CSS from rendered site (URL-derivable). API alternative: parse styles from page DOM where embedded.

**Checks:**
1. **CSS variable presence** — count `--*` declarations in `:root`
2. **var() usage frequency** — `var()` calls / total declarations
3. **Color uniqueness** — count unique hex codes site-wide. < 20 = system; 20-50 = somewhat; > 50 = chaos
4. **Font-size uniqueness** — same logic. < 12 = type system; 12-25 = some; > 25 = chaos
5. **Font-family count** — should be 1-3 max
6. **Style guide page detected** — bonus

**Scoring formula:**
```
var_presence_score = min(100, css_var_count × 5)        # 20+ vars = 100
var_usage_score = min(100, var_usage_pct × 200)         # 50%+ usage = 100
color_score = max(0, 100 - max(0, unique_colors - 12) × 2)
fontsize_score = max(0, 100 - max(0, unique_fontsizes - 8) × 4)
fontfamily_penalty = max(-20, -(font_families - 3) × 10) if font_families > 3 else 0
styleguide_bonus = 10 if styleguide_page_detected else 0

score = clamp(0, 100,
  var_presence_score × 0.30 +
  var_usage_score × 0.30 +
  color_score × 0.20 +
  fontsize_score × 0.20 +
  fontfamily_penalty +
  styleguide_bonus
)
```

**Issue thresholds:**
- 0 CSS variables → **Critical**
- unique_colors > 50 → **High**
- 0 var() usage despite vars defined → **High** (defined but not used = ornamental)

---

### Dimension 5 — SEO + Metadata Completeness (weight 10%)

**Why it matters:** "Audit and fix all metadata" is the #1 use case Webflow markets for MCP. To productize this, we need a baseline measurement and a gap report. Also, the gaps themselves become the implementation deliverable ("we'll fix all 47 missing meta descriptions in week 2").

**Data source:** `/pages` (each page has `seo` and `openGraph` objects).

**Checks per page:**
1. `seo.title` populated
2. `seo.description` populated
3. `openGraph.title` populated OR `titleCopied: true`
4. `openGraph.description` populated OR `descriptionCopied: true`
5. Slug follows kebab-case convention
6. Title length in [30, 60] chars
7. Description length in [120, 160] chars

**Scoring formula:**
```
score = (
  seo_title_pct × 25 +
  seo_desc_pct × 25 +
  og_title_pct × 15 +
  og_desc_pct × 15 +
  slug_consistency_pct × 10 +
  title_length_compliance_pct × 5 +
  desc_length_compliance_pct × 5
)
```

---

### Dimension 6 — Asset Hygiene (weight 8%)

**Why it matters:** "Insert the team photo into this page" requires Claude to identify the right asset. `Untitled-1.jpg` is unpickable; `team-leadership-2025.jpg` with alt text "Senior leadership team at offsite" is one prompt away from correctly inserted.

**Data source:** `/assets`.

**Auto-name patterns to flag:**
```
^Untitled[- ]?\d*$
^IMG[_\- ]?\d+$
^Screenshot.*
^image\d*$
^download.*
^DSC[_\- ]?\d+$
^[a-f0-9]{8,}$    # hash filenames
```

**Checks:**
1. **Alt text coverage** — % with `altText` non-empty
2. **Display name quality** — % NOT matching auto-name patterns
3. **Modern format adoption** — % in `webp` / `avif` vs `jpg` / `png` / `gif`
4. **Asset count** (informational)

**Scoring formula:**
```
score = (
  alt_text_coverage_pct × 50 +
  display_name_quality_pct × 35 +
  min(15, modern_format_pct × 0.15)
)
```

---

### Dimension 7 — Page Architecture (weight 8%)

**Why it matters:** Drafts/archives that aren't pruned create ambiguity ("publish my latest case study" — to which version?). Slug consistency, locale setup, and folder structure all signal whether this is a site Claude can navigate without surprises.

**Data source:** `/pages` + `/sites/:id`.

**Checks:**
1. **Slug consistency** — % of slugs in kebab-case
2. **Draft hygiene** — count of pages with `draft: true`. Some is fine; > 20% is a smell.
3. **Archive cleanup** — count of `archived: true`. Same logic.
4. **Folder depth** — max depth via `parentId` chain (site is well organized if depth 1-3; > 5 is messy)
5. **Locale setup** — multiple locales configured but `enabled: false` on primary = misconfigured
6. **404 + password page present** — bonus for hygiene (these exist by default but worth flagging if missing)
7. **System page count vs content page count** — if too many auto-Webflow templates linger, flag for cleanup

---

### Dimension 8 — Custom Code Footprint (weight 6%)

**Why it matters:** Custom code injections can break when MCP modifies surrounding markup. Heavy third-party embeds (Marketo forms, intercom, etc.) become invisible no-go zones for the agent.

**Data source:** `/custom_code` and `/registered_scripts` (if scope permits) + DOM scan for `<script>` tags as fallback.

**Checks:**
1. **Site-level custom code blocks** — count
2. **Page-level custom code** — count of pages with overrides
3. **Inline scripts vs registered scripts** — registered = better (named, managed)
4. **Third-party embed detection** — HubSpot, Marketo, Intercom, GTM, Segment, Hotjar, Drift, Calendly
5. **Script tag count per page** — averaged

**Scoring formula:**
```
# Inverse — lower footprint = higher score
base = 100
penalty_per_inline_script = 5
penalty_per_third_party = 3
penalty_per_page_override = 2

score = clamp(0, 100, base - inline_count × 5 - third_party_count × 3 - page_override_count × 2)
```

If endpoint returns 403, this dimension is marked "partial" and scored only from DOM-detected third-party embeds.

---

## 4. Overall Score

```
overall = Σ (dimension_score × dimension_weight)
```

**Bands:**

| Score | Band | Meaning |
|---|---|---|
| 90-100 | Excellent | MCP-ready. Ship as-is. |
| 75-89 | Good | Minor refactoring. Ready in 1-2 weeks. |
| 60-74 | Fair | Moderate refactor. 3-4 weeks. |
| 40-59 | Poor | Significant refactor. 5-8 weeks. |
| 0-39 | Critical | Foundational rebuild recommended before MCP integration. |

---

## 5. Issue Severity Model

| Severity | Definition | Example |
|---|---|---|
| **Critical** | MCP cannot operate safely or productively | 0 components, no class naming hygiene, broken CMS references |
| **High** | MCP usability significantly degraded | < 30% semantic classes, no CSS variables, no reference fields |
| **Medium** | MCP effectiveness reduced | < 50% alt text, scattered hex colors, sparse helpText |
| **Low** | Polish / hygiene | Slug inconsistencies, archived clutter, OG mirrors |

Each issue carries:
- `dimension` — which dimension it rolls into
- `severity` — Critical/High/Medium/Low
- `count` — instances detected
- `recommendation_id` — links to taxonomy below
- `mcp_use_case_blocked` — specific Webflow-marketed use case it inhibits
- `effort_estimate` — S (≤4hr) / M (4-16hr) / L (16+hr)

---

## 6. Recommendation Taxonomy

Each recommendation maps to an implementation task with a labor estimate. Used to auto-generate the implementation roadmap and pricing band.

| ID | Title | Trigger | Effort model |
|---|---|---|---|
| `RENAME_AUTO_CLASSES` | Rename N auto-named classes to semantic names | semantic_ratio < 80% | 0.1hr per class |
| `EXTRACT_TO_COMPONENTS` | Extract repeated patterns to components | repeated_patterns_detected > 10 | 1.5hr per component |
| `ESTABLISH_DESIGN_TOKENS` | Convert hardcoded values to CSS variables | css_var_count < 10 | 4hr base + 0.05hr per token |
| `NORMALIZE_CMS_SCHEMA` | Add Reference fields, validations, helpText | ref_density < 10% OR helptext_pct < 20% | 2hr per collection |
| `BUILD_STYLE_GUIDE_PAGE` | Create style guide page documenting tokens | no styleguide page detected | 6hr |
| `BACKFILL_SEO_METADATA` | Populate missing SEO/OG fields | seo_completeness < 80% | 0.05hr per page (auto via MCP itself once ready) |
| `BACKFILL_ALT_TEXT` | Add alt text to assets missing it | alt_coverage < 80% | 0.03hr per asset (auto via MCP) |
| `RENAME_ASSETS` | Rename auto-named assets | display_name_quality < 70% | 0.05hr per asset |
| `MIGRATE_TO_MODERN_FORMATS` | Convert assets to webp/avif | modern_format_pct < 50% | 0.05hr per asset |
| `PRUNE_DRAFTS_ARCHIVES` | Clean up draft/archived pages | draft_pct OR archive_pct > 20% | 1hr |
| `CONSOLIDATE_CUSTOM_CODE` | Move inline scripts to registered scripts | inline > registered | 2hr per script block |
| `REPLACE_THIRD_PARTY_EMBEDS` | Note no-go zones for MCP | third_party_count > 3 | informational only |

---

## 7. Implementation Pricing Bands

Auto-computed from total estimated hours. Blended at $175/hr (VAN rate).

| Band | Hours | Price | Timeline |
|---|---|---|---|
| **Light** | < 60 hrs | $5,000-$10,000 | 1-2 weeks |
| **Medium** | 60-150 hrs | $10,000-$25,000 | 3-4 weeks |
| **Heavy** | 150-300 hrs | $25,000-$50,000 | 5-8 weeks |
| **Foundational** | 300+ hrs | $50,000+ | custom-quoted |

Audit fee credits 100% toward implementation if signed within 30 days.

---

## 8. Report Structure

The audit produces a single PDF + matching dashboard view. Sections in order:

1. **Cover** — Site URL, score (large), band label, date, VAN brand
2. **Executive Summary** — One page. Score, top 3 issues, recommended implementation band, "what this means for your team"
3. **Top Priorities** — Top 5 issues ranked by severity × dimension weight
4. **What's Working** — Highlight 3-5 wins to seed motivation
5. **Detailed Findings by Dimension** — Each of 8 dimensions: score, sub-checks, ranked issues with counts and recommendations
6. **Implementation Roadmap** — Phased plan
   - **Phase 1: Foundation** (Critical issues — must fix before MCP connection)
   - **Phase 2: Optimization** (High issues — major usability lift)
   - **Phase 3: Enablement** (Medium/Low — polish, prompts, training)
7. **Investment** — Implementation pricing band + audit fee credit + timeline
8. **Next Steps** — How to engage VAN, kickoff process, FAQ

---

## 9. Free Snapshot vs Paid Audit

**Free Snapshot** (URL-only, no token, instant):
- Runs Style Tokenization (URL CSS parsing) + SEO Completeness (sitemap/page meta scrape) + lightweight Class Hygiene (rendered HTML class scan)
- Output: Top-line score, top 3 issues, "your site is X% ready for MCP"
- Single CTA: "Get the full audit to see all 8 dimensions and your implementation roadmap"
- Built to convert into the paid audit

**Paid Audit** (token-required, 24-48hr turnaround):
- Full 8-dimension scoring
- Detailed findings with specific instance counts (not estimates)
- Phased implementation roadmap with priced bands
- Audit fee credits 100% toward implementation if signed within 30 days

---

## 10. Open Questions for Engineering

1. **Component DOM endpoint shape** — `/v2/sites/:id/components` returns metadata only. Does a `/v2/components/:id/dom` exist? (Need to confirm with Webflow docs / Raymond Camden.)
2. **Custom code scope tier** — what scope level grants `custom_code:read`? Is it always available on read-only tokens or does it need additional consent?
3. **Rate limits** — Webflow API rate limits per token. Need to plan crawl pacing for sites with 500+ pages.
4. **Localized sites** — Multi-locale audit logic. Score primary locale only? Score each? Average?
5. **Ecommerce sites** — Products endpoint exists. Worth adding a 9th dimension for ecom hygiene, or leave as informational only?
6. **Branch / staging support** — Webflow supports branches. Should audit run against published or latest draft? (Probably published, with optional draft override.)

---

## 11. Validation Plan Before Build

1. Run manual audit against 3 known Webflow sites (one we built, one we know is a mess, one enterprise reference). Score by hand using this rubric. Compare to gut.
2. Get Raymond Camden (Webflow Sr. Dev Evangelist) on a 30-min call to validate dimension weights and identify any signals we're missing.
3. Pilot with 2 friendly Tier 1 prospects post-event. Observe whether the report drives implementation conversion.
