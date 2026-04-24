import { randomUUID } from "node:crypto";

import { crawlSite } from "./crawl.js";
import { dispatchAuditNotifications } from "./integrations.js";
import { buildIssuesWorkbook, buildMarkdownReport, buildPdfReport } from "./report.js";
import { buildFullAudit, buildSnapshotAudit } from "./scoring.js";
import { createAuditRecord, getAuditRecord, listAuditRecords, updateAuditRecord, writeAuditExport } from "./storage.js";
import { WebflowApiError, WebflowClient } from "./webflow-client.js";

const jobs = new Map();

function now() {
  return new Date().toISOString();
}

function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.items)) {
    return value.items;
  }

  return [];
}

async function resolveSiteId(client, requestedSiteId) {
  if (requestedSiteId) {
    return requestedSiteId;
  }

  const sites = await client.listSites();
  const [site] = asList(sites);
  return site?.id ?? site?._id ?? null;
}

async function fetchPageDoms(client, pages) {
  const settled = await Promise.allSettled(
    pages.map(async (page) => {
      const pageId = page.id ?? page._id ?? page.pageId;
      if (!pageId) {
        return null;
      }
      return client.getPageDom(pageId);
    })
  );

  return settled
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

async function fetchCollectionSchemas(client, collections) {
  const settled = await Promise.allSettled(
    collections.map(async (collection) => {
      const collectionId = collection.id ?? collection._id;
      if (!collectionId) {
        return null;
      }
      return client.getCollection(collectionId);
    })
  );

  return settled
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

async function buildExports(audit) {
  const markdown = buildMarkdownReport(audit);
  const pdf = await buildPdfReport(audit);
  const workbook = await buildIssuesWorkbook(audit);

  const [markdownPath, pdfPath, workbookPath] = await Promise.all([
    writeAuditExport(audit.id, "report.md", markdown),
    writeAuditExport(audit.id, "report.pdf", pdf),
    writeAuditExport(audit.id, "issues.xlsx", workbook)
  ]);

  return {
    markdownPath,
    pdfPath,
    workbookPath
  };
}

export async function runSnapshot(input) {
  const crawl = await crawlSite(input.url);
  const result = buildSnapshotAudit({ crawl });
  return {
    input,
    crawl,
    result
  };
}

export async function runPaidAudit(input) {
  const crawl = await crawlSite(input.url);
  const partials = {};

  if (!input.token) {
    const result = buildFullAudit({
      crawl,
      site: null,
      pages: crawl.pages,
      pageDoms: [],
      collections: [],
      components: [],
      assets: [],
      customCode: null,
      registeredScripts: [],
      partials: {
        componentAdoption: true,
        cmsSchema: true,
        assetHygiene: true,
        pageArchitecture: false,
        customCode: true
      }
    });
    return { input, crawl, result };
  }

  const client = new WebflowClient(input.token);
  const siteId = await resolveSiteId(client, input.siteId);
  if (!siteId) {
    throw new Error("No Webflow site was available for the supplied token.");
  }

  const site = await client.getSite(siteId);
  const pagesResponse = await client.getPages(siteId);
  const pages = asList(pagesResponse);
  const [pageDoms, componentsResponse, collectionsResponse, assetsResponse] = await Promise.all([
    fetchPageDoms(client, pages),
    client.getComponents(siteId),
    client.getCollections(siteId),
    client.getAssets(siteId)
  ]);
  const components = asList(componentsResponse);
  const collections = await fetchCollectionSchemas(client, asList(collectionsResponse));
  const assets = asList(assetsResponse);

  let customCode = null;
  let registeredScripts = [];
  try {
    [customCode, registeredScripts] = await Promise.all([
      client.getCustomCode(siteId),
      client.getRegisteredScripts(siteId).then(asList)
    ]);
  } catch (error) {
    if (error instanceof WebflowApiError && (error.status === 403 || error.status === 409)) {
      partials.customCode = true;
    } else {
      throw error;
    }
  }

  const result = buildFullAudit({
    crawl,
    site,
    pages,
    pageDoms,
    collections,
    components,
    assets,
    customCode,
    registeredScripts,
    partials
  });

  return {
    input: { ...input, siteId },
    crawl,
    result
  };
}

async function processAuditJob(auditId) {
  jobs.set(auditId, { status: "running", startedAt: now() });
  await updateAuditRecord(auditId, (current) => ({
    ...current,
    status: "running",
    startedAt: now()
  }));

  try {
    const current = await getAuditRecord(auditId);
    const run = current.type === "snapshot" ? runSnapshot : runPaidAudit;
    const executed = await run(current.input);
    const completedAudit = {
      ...current,
      ...executed,
      status: "completed",
      completedAt: now(),
      updatedAt: now()
    };
    completedAudit.exports = await buildExports(completedAudit);
    completedAudit.integrationErrors = await dispatchAuditNotifications(completedAudit);

    await updateAuditRecord(auditId, completedAudit);
    jobs.set(auditId, { status: "completed", completedAt: completedAudit.completedAt });
  } catch (error) {
    await updateAuditRecord(auditId, (current) => ({
      ...current,
      status: "failed",
      error: error.message,
      failedAt: now()
    }));
    jobs.set(auditId, { status: "failed", error: error.message });
  }
}

export async function createAuditJob({ type, input }) {
  const audit = {
    id: randomUUID(),
    type,
    status: "queued",
    input,
    createdAt: now(),
    updatedAt: now()
  };

  await createAuditRecord(audit);
  queueMicrotask(() => {
    processAuditJob(audit.id);
  });
  return audit;
}

export function getJobState(auditId) {
  return jobs.get(auditId) ?? null;
}

export { getAuditRecord, listAuditRecords };
