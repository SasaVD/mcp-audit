import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

import { formatDate, round } from "./utils.js";

function sectionTitle(title) {
  return `## ${title}\n\n`;
}

export function buildMarkdownReport(audit) {
  const result = audit.result;
  const lines = [];

  lines.push(`# MCP Readiness Audit`);
  lines.push("");
  lines.push(`- Site: ${audit.input.url}`);
  lines.push(`- Audit type: ${result.auditType}`);
  lines.push(`- Score: ${result.overallScore}/100 (${result.band})`);
  lines.push(`- Date: ${formatDate(audit.completedAt ?? audit.updatedAt ?? audit.createdAt)}`);
  lines.push("");
  lines.push(sectionTitle("Executive Summary"));
  lines.push(
    `This site scored **${result.overallScore}/100**, which places it in the **${result.band}** readiness band for Webflow MCP operations. ${result.readinessMessage ?? ""}`.trim()
  );
  lines.push("");
  lines.push(`Recommended implementation band: **${result.roadmap.band}** (${result.roadmap.priceRange}, ${result.roadmap.timeline}).`);
  lines.push("");
  if (result.auditType === "snapshot" && result.consumerBreakdown) {
    lines.push(sectionTitle("Snapshot Breakdown"));
    lines.push(`This snapshot checked **${result.coverage?.dimensionsScored ?? 0} areas** across **${result.coverage?.pagesSampled ?? 0} sampled pages**: ${(result.coverage?.checkedAreas ?? []).join(", ")}.`);
    lines.push("");
    lines.push(`### What's Working`);
    if (!result.consumerBreakdown.whatsWorking.length) {
      lines.push(`- No clear strengths surfaced in the snapshot dimensions yet.`);
    } else {
      for (const item of result.consumerBreakdown.whatsWorking) {
        lines.push(`- **${item.dimension}** (${item.score}/100): ${item.summary} ${item.proof}`);
      }
    }
    lines.push("");
    lines.push(`### Needs Attention`);
    if (!result.consumerBreakdown.needsAttention.length) {
      lines.push(`- No major weaknesses surfaced in the snapshot dimensions.`);
    } else {
      for (const item of result.consumerBreakdown.needsAttention) {
        lines.push(`- **${item.dimension}** (${item.score}/100): ${item.summary} ${item.proof} Next step: ${item.nextStep}`);
      }
    }
    lines.push("");
  }
  lines.push(sectionTitle("Top Priorities"));
  if (!result.topIssues.length) {
    lines.push(`No major blockers were detected in the scored dimensions.`);
  } else {
    for (const issue of result.topIssues) {
      lines.push(`- [${issue.severity}] ${issue.dimension}: ${issue.title}`);
      lines.push(`  ${issue.detail}`);
    }
  }
  lines.push("");
  lines.push(sectionTitle("What's Working"));
  if (!result.wins.length) {
    lines.push(`- No standout strengths yet; most value is concentrated in remediation work.`);
  } else {
    for (const win of result.wins) {
      lines.push(`- ${win}`);
    }
  }
  lines.push("");
  lines.push(sectionTitle("Detailed Findings by Dimension"));
  for (const dimension of result.dimensions) {
    lines.push(`### ${dimension.name}`);
    lines.push("");
    lines.push(`- Status: ${dimension.status}`);
    lines.push(`- Score: ${dimension.score}/100`);
    lines.push(`- Summary: ${dimension.summary}`);
    for (const [key, value] of Object.entries(dimension.metrics)) {
      lines.push(`- ${key}: ${value}`);
    }
    if (dimension.issues.length) {
      lines.push(`- Issues:`);
      for (const issue of dimension.issues) {
        lines.push(`  - [${issue.severity}] ${issue.title} (${issue.count ?? 1})`);
      }
    }
    lines.push("");
  }
  lines.push(sectionTitle("Implementation Roadmap"));
  for (const [title, items] of [
    ["Phase 1: Foundation", result.roadmap.phase1],
    ["Phase 2: Optimization", result.roadmap.phase2],
    ["Phase 3: Enablement", result.roadmap.phase3]
  ]) {
    lines.push(`### ${title}`);
    if (!items.length) {
      lines.push(`- No items in this phase.`);
    } else {
      for (const item of items) {
        lines.push(`- ${item.title} (${round(item.hours, 1)} hrs)`);
      }
    }
    lines.push("");
  }
  lines.push(sectionTitle("Investment"));
  lines.push(`- Implementation band: ${result.roadmap.band}`);
  lines.push(`- Price range: ${result.roadmap.priceRange}`);
  lines.push(`- Timeline: ${result.roadmap.timeline}`);
  lines.push(`- Estimated effort: ${result.roadmap.totalHours} hrs`);
  lines.push(`- Credit: ${result.roadmap.auditFeeCredit}`);
  lines.push("");
  lines.push(sectionTitle("Next Steps"));
  lines.push(`1. Confirm audit findings with the Webflow operator and marketing owner.`);
  lines.push(`2. Scope Phase 1 work into a fixed proposal.`);
  lines.push(`3. Connect Claude to Webflow only after Foundation issues are resolved.`);
  lines.push("");

  return lines.join("\n");
}

export async function buildIssuesWorkbook(audit) {
  const rows = audit.result.issues.map((issue) => ({
    Dimension: issue.dimension,
    Severity: issue.severity,
    Title: issue.title,
    Detail: issue.detail,
    Count: issue.count ?? 1,
    Recommendation: issue.recommendationId ?? "",
    BlockedUseCase: issue.mcpUseCaseBlocked ?? "",
    EffortEstimate: issue.effortEstimate ?? ""
  }));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Issues");

  if (rows.length) {
    worksheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    worksheet.addRows(rows);
  } else {
    worksheet.columns = [{ header: "Note", key: "Note" }];
    worksheet.addRow({ Note: "No issues detected" });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildPdfReport(audit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 48, size: "LETTER" });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0D121C");
    doc.fillColor("#6EFFFF").fontSize(28).text("MCP Readiness Audit", 48, 48);
    doc.fillColor("#FFFFFF").fontSize(12).text(audit.input.url, 48, 92);
    doc.moveDown();
    doc.fontSize(42).fillColor("#6EFFFF").text(`${audit.result.overallScore}`, 48, 130);
    doc.fontSize(16).fillColor("#FFFFFF").text(`Readiness Score (${audit.result.band})`, 48, 182);
    doc.moveDown(2);
    doc.fontSize(12).text(`Audit type: ${audit.result.auditType}`);
    doc.text(`Date: ${formatDate(audit.completedAt ?? audit.updatedAt ?? audit.createdAt)}`);
    doc.text(`Implementation band: ${audit.result.roadmap.band}`);
    doc.text(`Price range: ${audit.result.roadmap.priceRange}`);
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#FFFFFF").text(audit.result.readinessMessage ?? "");
    doc.moveDown();
    doc.fontSize(16).fillColor("#6EFFFF").text("Top Priorities");
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#FFFFFF");
    for (const issue of audit.result.topIssues) {
      doc.text(`[${issue.severity}] ${issue.dimension}: ${issue.title}`);
      doc.text(issue.detail, { indent: 14 });
      doc.moveDown(0.5);
    }

    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0D121C");
    doc.fillColor("#6EFFFF").fontSize(18).text("Dimension Scores", 48, 48);
    doc.moveDown();
    for (const dimension of audit.result.dimensions) {
      doc.fillColor("#FFFFFF").fontSize(12).text(`${dimension.name}: ${dimension.score}/100 (${dimension.status})`);
      doc.fontSize(10).text(`${dimension.summary} ${audit.result.auditType === "snapshot" ? ` ${dimension.metrics ? "" : ""}` : ""}`.trim(), { indent: 14 });
      if (audit.result.auditType === "snapshot" && audit.result.consumerBreakdown) {
        const card = audit.result.consumerBreakdown.dimensionCards.find((entry) => entry.key === dimension.key);
        if (card?.proof) {
          doc.fontSize(9).fillColor("#95A8BA").text(card.proof, { indent: 14 });
          doc.fillColor("#FFFFFF");
        }
      }
      doc.moveDown(0.4);
    }

    doc.end();
  });
}
