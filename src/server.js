import { readFile } from "node:fs/promises";

import Fastify from "fastify";

import { createAuditJob, getAuditRecord, listAuditRecords, runSnapshot } from "./lib/engine.js";
import { buildIssuesWorkbook, buildMarkdownReport, buildPdfReport } from "./lib/report.js";
import { createAuditRecord, getExportPath, updateAuditRecord, writeAuditExport } from "./lib/storage.js";

const app = Fastify({
  logger: false
});

function jsonContentType(fileName) {
  if (fileName.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  if (fileName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (fileName.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function auditSummaryCard(audit) {
  const status = audit.status;
  const score = audit.result?.overallScore ?? "Pending";
  const band = audit.result?.band ?? "";
  return `
    <article class="card">
      <div class="eyebrow">${escapeHtml(audit.type)}</div>
      <h3><a href="/audits/${audit.id}">${escapeHtml(audit.input.url)}</a></h3>
      <p>Status: <strong>${escapeHtml(status)}</strong></p>
      <p>Score: <strong>${escapeHtml(score)}</strong> ${band ? `(${escapeHtml(band)})` : ""}</p>
      <p class="meta">${escapeHtml(audit.createdAt)}</p>
    </article>
  `;
}

function renderLayout({ title, body, script = "" }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          --bg: #0d121c;
          --surface: #161d2b;
          --border: rgba(110, 255, 255, 0.18);
          --text: #f4f8fb;
          --muted: #95a8ba;
          --accent: #6effff;
          --danger: #ff7171;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          background:
            radial-gradient(circle at top right, rgba(110, 255, 255, 0.12), transparent 25%),
            linear-gradient(180deg, #0d121c, #0a0f18 60%);
          color: var(--text);
        }
        a { color: var(--accent); }
        main {
          width: min(1100px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 40px 0 72px;
        }
        .hero {
          display: grid;
          gap: 18px;
          grid-template-columns: 1.4fr 1fr;
          align-items: start;
          margin-bottom: 32px;
        }
        .panel, .card {
          background: rgba(22, 29, 43, 0.92);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
        }
        .hero h1 {
          margin: 0 0 10px;
          font-size: clamp(2.2rem, 4vw, 3.8rem);
          line-height: 0.95;
          letter-spacing: -0.03em;
        }
        .eyebrow {
          color: var(--accent);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.14em;
          margin-bottom: 10px;
        }
        p, li {
          color: var(--muted);
          line-height: 1.5;
        }
        form {
          display: grid;
          gap: 12px;
        }
        input, button, textarea {
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(8, 12, 20, 0.85);
          color: var(--text);
          padding: 14px 16px;
          font: inherit;
        }
        button {
          background: var(--accent);
          color: #00131c;
          font-weight: 700;
          cursor: pointer;
          border: none;
        }
        .grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .split {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .meta {
          font-size: 0.9rem;
          color: var(--muted);
        }
        .score {
          font-size: 3rem;
          font-weight: 700;
          color: var(--accent);
          margin: 0;
        }
        .issue {
          padding: 12px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(110, 255, 255, 0.18);
          background: rgba(110, 255, 255, 0.08);
          color: var(--text);
          font-size: 0.85rem;
        }
        .metric-card h3, .snapshot-block h3 {
          margin: 0 0 8px;
          font-size: 1.1rem;
        }
        .snapshot-block {
          padding: 18px 0 0;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          margin-top: 18px;
        }
        .snapshot-list {
          display: grid;
          gap: 12px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .snapshot-list li {
          padding: 14px 16px;
          border-radius: 14px;
          background: rgba(8, 12, 20, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .snapshot-list strong {
          color: var(--text);
        }
        .danger { color: var(--danger); }
        @media (max-width: 860px) {
          .hero { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <main>${body}</main>
      ${script ? `<script>${script}</script>` : ""}
    </body>
  </html>`;
}

app.get("/health", async () => ({ ok: true }));

app.get("/", async (request, reply) => {
  const audits = (await listAuditRecords()).slice(0, 6);

  return reply.type("text/html; charset=utf-8").send(renderLayout({
    title: "MCP Readiness Audit",
    body: `
      <section class="hero">
        <div class="panel">
          <div class="eyebrow">V1 Snapshot</div>
          <h1>Audit a Webflow site for Claude readiness.</h1>
          <p>Run the free snapshot against any public site, then queue a paid audit with an optional Webflow read-only token for all eight dimensions.</p>
        </div>
        <div class="panel">
          <form id="snapshot-form">
            <label>
              <div class="eyebrow">Free Snapshot</div>
              <input type="url" name="url" placeholder="https://example.com" required />
            </label>
            <label>
              <input type="email" name="email" placeholder="Email for follow-up (optional)" />
            </label>
            <button type="submit">Run Snapshot</button>
          </form>
        </div>
      </section>
      <section class="panel" id="snapshot-result">
        <div class="eyebrow">Result</div>
        <p>Paste a site URL to generate the snapshot. The result renders inline here.</p>
      </section>
      <section class="panel" style="margin-top: 24px;">
        <div class="eyebrow">Paid Audit</div>
        <form method="post" action="/api/audits" id="paid-audit-form">
          <input type="url" name="url" placeholder="https://example.com" required />
          <input type="email" name="email" placeholder="Contact email" />
          <input type="text" name="company" placeholder="Company name" />
          <input type="text" name="siteId" placeholder="Webflow site ID (optional)" />
          <textarea name="token" rows="4" placeholder="Read-only Webflow token (optional; if omitted, the audit will run partially)"></textarea>
          <button type="submit">Queue Paid Audit</button>
        </form>
      </section>
      <section style="margin-top: 24px;">
        <div class="eyebrow">Recent Audits</div>
        <div class="grid">
          ${audits.map(auditSummaryCard).join("") || `<p>No audits have been run yet.</p>`}
        </div>
      </section>
    `,
    script: `
      const snapshotForm = document.getElementById("snapshot-form");
      const result = document.getElementById("snapshot-result");
      const paidForm = document.getElementById("paid-audit-form");

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function renderSnapshotList(items, emptyText, includeNextStep = false) {
        if (!items.length) {
          return '<p>' + escapeHtml(emptyText) + '</p>';
        }

        return '<ul class="snapshot-list">' + items.map((item) =>
          '<li>' +
            '<strong>' + escapeHtml(item.dimension) + '</strong> ' +
            '<span class="chip">' + escapeHtml(item.score) + '/100 · ' + escapeHtml(item.label) + '</span>' +
            '<p>' + escapeHtml(item.summary) + '</p>' +
            '<p class="meta">' + escapeHtml(item.proof) + '</p>' +
            (includeNextStep ? '<p><strong>Next step:</strong> ' + escapeHtml(item.nextStep) + '</p>' : '') +
          '</li>'
        ).join("") + '</ul>';
      }

      function renderDimensionCards(items) {
        return '<div class="grid">' + items.map((item) =>
          '<article class="card metric-card">' +
            '<div class="eyebrow">' + escapeHtml(item.label) + '</div>' +
            '<h3>' + escapeHtml(item.dimension) + '</h3>' +
            '<p class="score" style="font-size: 2rem;">' + escapeHtml(item.score) + '</p>' +
            '<p>' + escapeHtml(item.summary) + '</p>' +
            '<p class="meta">' + escapeHtml(item.proof) + '</p>' +
          '</article>'
        ).join("") + '</div>';
      }

      snapshotForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        result.innerHTML = '<div class="eyebrow">Result</div><p>Running snapshot...</p>';
        const data = new FormData(snapshotForm);
        const payload = Object.fromEntries(data.entries());
        const response = await fetch("/api/snapshot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok) {
          result.innerHTML = '<div class="eyebrow">Result</div><p class="danger">' + body.error + '</p>';
          return;
        }
        const issues = body.result.topIssues.map((issue) => '<div class="issue"><strong>[' + escapeHtml(issue.severity) + ']</strong> ' + escapeHtml(issue.title) + '<p>' + escapeHtml(issue.detail) + '</p></div>').join("");
        const breakdown = body.result.consumerBreakdown;
        result.innerHTML =
          '<div class="eyebrow">Snapshot Complete</div>' +
          '<p class="score">' + escapeHtml(body.result.overallScore) + '</p>' +
          '<p><strong>' + escapeHtml(body.result.band) + '</strong> readiness for MCP operations.</p>' +
          '<p>' + escapeHtml(body.result.readinessMessage || '') + '</p>' +
          '<p class="meta">This snapshot checked ' + escapeHtml(body.result.coverage.dimensionsScored) + ' areas across ' + escapeHtml(body.result.coverage.pagesSampled) + ' sampled pages: ' + escapeHtml(body.result.coverage.checkedAreas.join(", ")) + '.</p>' +
          '<div class="snapshot-block">' +
            '<div class="split">' +
              '<div>' +
                '<div class="eyebrow">What’s Working</div>' +
                renderSnapshotList(breakdown.whatsWorking, 'No clear strengths surfaced yet in the snapshot dimensions.') +
              '</div>' +
              '<div>' +
                '<div class="eyebrow">Needs Attention</div>' +
                renderSnapshotList(breakdown.needsAttention, 'No major weaknesses surfaced in the snapshot dimensions.', true) +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="snapshot-block">' +
            '<div class="eyebrow">Dimension Breakdown</div>' +
            renderDimensionCards(breakdown.dimensionCards) +
          '</div>' +
          '<div class="snapshot-block">' +
            '<div class="eyebrow">Top Fixes From Snapshot</div>' +
            (issues || '<p>No major blockers detected in the snapshot dimensions.</p>') +
          '</div>' +
          '<div class="snapshot-block">' +
            '<p>Recommended implementation band: <strong>' + escapeHtml(body.result.roadmap.band) + '</strong> (' + escapeHtml(body.result.roadmap.priceRange) + ').</p>' +
            '<p><a href="/audits/' + body.id + '">Open the full saved snapshot report</a></p>' +
          '</div>';
      });

      paidForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(paidForm).entries());
        const response = await fetch("/api/audits", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok) {
          alert(body.error);
          return;
        }
        window.location.href = '/audits/' + body.id;
      });
    `
  }));
});

app.post("/api/snapshot", async (request, reply) => {
  const { url, email } = request.body ?? {};
  if (!url) {
    return reply.code(400).send({ error: "URL is required." });
  }

  try {
    const started = new Date().toISOString();
    const execution = await runSnapshot({ url, email });
    const audit = {
      id: crypto.randomUUID(),
      type: "snapshot",
      status: "completed",
      createdAt: started,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      input: { url, email },
      result: execution.result
    };
    const markdown = buildMarkdownReport(audit);
    const pdf = await buildPdfReport(audit);
    const workbook = buildIssuesWorkbook(audit);
    audit.exports = {
      markdownPath: await writeAuditExport(audit.id, "report.md", markdown),
      pdfPath: await writeAuditExport(audit.id, "report.pdf", pdf),
      workbookPath: await writeAuditExport(audit.id, "issues.xlsx", workbook)
    };
    await createAuditRecord(audit);
    return audit;
  } catch (error) {
    return reply.code(500).send({ error: error.message });
  }
});

app.post("/api/audits", async (request, reply) => {
  const { url, email, company, siteId, token } = request.body ?? {};
  if (!url) {
    return reply.code(400).send({ error: "URL is required." });
  }

  const audit = await createAuditJob({
    type: "paid",
    input: {
      url,
      email,
      company,
      siteId,
      token
    }
  });

  return reply.code(202).send(audit);
});

app.get("/api/audits/:id", async (request, reply) => {
  const audit = await getAuditRecord(request.params.id);
  if (!audit) {
    return reply.code(404).send({ error: "Audit not found." });
  }
  return audit;
});

app.get("/audits/:id", async (request, reply) => {
  const audit = await getAuditRecord(request.params.id);
  if (!audit) {
    return reply.code(404).type("text/plain").send("Audit not found.");
  }

  const result = audit.result;
  return reply.type("text/html; charset=utf-8").send(renderLayout({
    title: audit.input.url,
    body: `
      <section class="panel">
        <div class="eyebrow">${escapeHtml(audit.type)} audit</div>
        <h1 style="font-size: 2.4rem; margin-top: 0;">${escapeHtml(audit.input.url)}</h1>
        <p>Status: <strong>${escapeHtml(audit.status)}</strong></p>
        ${
          result
            ? `
              <p class="score">${escapeHtml(result.overallScore)}</p>
              <p>${escapeHtml(result.band)} readiness. ${escapeHtml(result.readinessMessage ?? "")}</p>
              <p>Recommended ${escapeHtml(result.roadmap.band)} implementation at ${escapeHtml(result.roadmap.priceRange)}.</p>
              <p>
                <a href="/exports/${audit.id}/report.md">Markdown</a> |
                <a href="/exports/${audit.id}/report.pdf">PDF</a> |
                <a href="/exports/${audit.id}/issues.xlsx">Excel</a>
              </p>
            `
            : `<p>The audit is queued or running. Reload this page to check progress.</p>`
        }
      </section>
      ${
        result
          ? `
          ${
            result.auditType === "snapshot" && result.consumerBreakdown
              ? `
          <section class="split" style="margin-top: 24px;">
            <article class="panel">
              <div class="eyebrow">What’s Working</div>
              ${
                result.consumerBreakdown.whatsWorking.length
                  ? `<ul class="snapshot-list">${result.consumerBreakdown.whatsWorking
                      .map(
                        (item) => `
                    <li>
                      <strong>${escapeHtml(item.dimension)}</strong> <span class="chip">${escapeHtml(item.score)}/100 · ${escapeHtml(item.label)}</span>
                      <p>${escapeHtml(item.summary)}</p>
                      <p class="meta">${escapeHtml(item.proof)}</p>
                    </li>
                  `
                      )
                      .join("")}</ul>`
                  : `<p>No clear strengths surfaced yet in the snapshot dimensions.</p>`
              }
            </article>
            <article class="panel">
              <div class="eyebrow">Needs Attention</div>
              ${
                result.consumerBreakdown.needsAttention.length
                  ? `<ul class="snapshot-list">${result.consumerBreakdown.needsAttention
                      .map(
                        (item) => `
                    <li>
                      <strong>${escapeHtml(item.dimension)}</strong> <span class="chip">${escapeHtml(item.score)}/100 · ${escapeHtml(item.label)}</span>
                      <p>${escapeHtml(item.summary)}</p>
                      <p class="meta">${escapeHtml(item.proof)}</p>
                      <p><strong>Next step:</strong> ${escapeHtml(item.nextStep)}</p>
                    </li>
                  `
                      )
                      .join("")}</ul>`
                  : `<p>No major weaknesses surfaced in the snapshot dimensions.</p>`
              }
            </article>
          </section>
          `
              : ""
          }
          <section class="grid" style="margin-top: 24px;">
            ${result.dimensions
              .map(
                (dimension) => `
              <article class="card">
                <div class="eyebrow">${escapeHtml(dimension.status)}</div>
                <h3>${escapeHtml(dimension.name)}</h3>
                <p class="score" style="font-size: 2rem;">${escapeHtml(dimension.score)}</p>
                <p>${escapeHtml(dimension.summary)}</p>
                ${result.auditType === "snapshot" && result.consumerBreakdown
                  ? `<p class="meta">${escapeHtml(result.consumerBreakdown.dimensionCards.find((entry) => entry.key === dimension.key)?.proof ?? "")}</p>`
                  : ""}
              </article>
            `
              )
              .join("")}
          </section>
          <section class="panel" style="margin-top: 24px;">
            <div class="eyebrow">Top Issues</div>
            ${
              result.topIssues.length
                ? result.topIssues
                    .map(
                      (issue) => `
                <div class="issue">
                  <strong>[${escapeHtml(issue.severity)}] ${escapeHtml(issue.title)}</strong>
                  <p>${escapeHtml(issue.detail)}</p>
                  <p class="meta">${escapeHtml(issue.dimension)} · recommendation ${escapeHtml(issue.recommendationId ?? "n/a")}</p>
                </div>
              `
                    )
                    .join("")
                : `<p>No issues detected.</p>`
            }
          </section>
          `
          : ""
      }
    `
  }));
});

app.get("/dashboard", async (request, reply) => {
  const audits = await listAuditRecords();
  return reply.type("text/html; charset=utf-8").send(renderLayout({
    title: "Dashboard",
    body: `
      <section class="panel">
        <div class="eyebrow">History</div>
        <h1 style="margin-top: 0;">Audit Dashboard</h1>
        <div class="grid">
          ${audits.map(auditSummaryCard).join("") || `<p>No audits yet.</p>`}
        </div>
      </section>
    `
  }));
});

app.get("/exports/:auditId/:fileName", async (request, reply) => {
  const { auditId, fileName } = request.params;
  const exportPath = getExportPath(auditId, fileName);

  try {
    const contents = await readFile(exportPath);
    reply.header("content-type", jsonContentType(fileName));
    return reply.send(contents);
  } catch {
    return reply.code(404).send({ error: "Export not found." });
  }
});

const port = Number(process.env.PORT ?? "3000");
app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  console.error(error);
  process.exit(1);
});
