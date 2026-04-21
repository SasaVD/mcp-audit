import test from "node:test";
import assert from "node:assert/strict";

import { buildFullAudit, buildSnapshotAudit } from "../src/lib/scoring.js";
import { buildMarkdownReport } from "../src/lib/report.js";

test("snapshot audit scores tokenized, semantic sites highly", () => {
  const result = buildSnapshotAudit({
    crawl: {
      classes: [
        "hero",
        "hero",
        "hero__title",
        "button-primary",
        "button-primary",
        "site-header",
        "site-footer"
      ],
      cssText: `
        :root { --color-brand: #00cccc; --space-lg: 32px; }
        .button-primary { color: var(--color-brand); font-size: 16px; }
      `,
      styleguideUrl: "https://example.com/style-guide",
      pages: [
        {
          title: "Acme | Product",
          seo: { title: "Acme Product Platform for Teams", description: "A 140 character description that should fit within the recommended metadata window for the purpose of this test fixture." },
          openGraph: { title: "Acme Product Platform for Teams", description: "A 140 character description that should fit within the recommended metadata window for the purpose of this test fixture." },
          slug: "product-platform"
        }
      ]
    }
  });

  assert.ok(result.overallScore >= 70);
  assert.equal(result.topIssues.length, 1);
  assert.equal(result.coverage.dimensionsScored, 5);
  assert.ok(result.consumerBreakdown.dimensionCards.length >= 5);
  assert.ok(result.consumerBreakdown.whatsWorking.length >= 1);
});

test("full audit surfaces critical problems for empty systems", () => {
  const result = buildFullAudit({
    crawl: {
      classes: ["div-block-1", "div-block-2", "button-1"],
      cssText: ".foo { color: #111111; } .bar { color: #222222; }",
      styleguideUrl: null,
      pages: [
        {
          title: "Home",
          seo: { title: "", description: "" },
          openGraph: {},
          slug: "Home"
        }
      ],
      thirdPartyEmbeds: ["HubSpot", "Intercom", "Segment", "Calendly"]
    },
    site: { locales: [{ primary: true, enabled: false }] },
    pages: [
      {
        id: "page_1",
        title: "Home",
        seo: { title: "", description: "" },
        openGraph: {},
        slug: "Home",
        draft: true,
        archived: true
      }
    ],
    pageDoms: [],
    collections: [
      {
        id: "collection_1",
        fields: [
          { name: "Title", type: "PlainText", isRequired: true },
          { name: "Body", type: "RichText" }
        ]
      }
    ],
    components: [],
    assets: [
      { fileName: "Untitled-1.jpg", altText: "" },
      { fileName: "IMG_1234.png", altText: "" }
    ],
    customCode: { head: ["<script>console.log('x')</script>"] },
    registeredScripts: []
  });

  assert.ok(result.overallScore < 50);
  assert.equal(result.band, "Critical");
  assert.ok(result.topIssues.some((issue) => issue.severity === "Critical"));
  assert.equal(result.roadmap.band, "Light");
});

test("markdown report includes required sections", () => {
  const audit = {
    id: "audit_1",
    input: { url: "https://example.com" },
    createdAt: "2026-04-17T12:00:00.000Z",
    result: buildSnapshotAudit({
      crawl: {
        classes: ["hero", "button-primary"],
        cssText: ":root { --color-brand: #00cccc; } .button-primary { color: var(--color-brand); }",
        styleguideUrl: null,
        pages: [
          {
            title: "Example title within the recommended metadata range",
            seo: {
              title: "Example title within the recommended metadata range",
              description: "A description that falls within the recommended length window for testing this export section."
            },
            openGraph: {
              title: "Example title within the recommended metadata range",
              description: "A description that falls within the recommended length window for testing this export section."
            },
            slug: "example-page"
          }
        ]
      }
    })
  };

  const markdown = buildMarkdownReport(audit);
  assert.match(markdown, /Executive Summary/);
  assert.match(markdown, /Implementation Roadmap/);
  assert.match(markdown, /Investment/);
});
