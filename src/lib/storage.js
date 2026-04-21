import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const AUDITS_DIR = path.join(DATA_DIR, "audits");
const EXPORTS_DIR = path.join(DATA_DIR, "exports");

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function ensureStorage() {
  await ensureDir(AUDITS_DIR);
  await ensureDir(EXPORTS_DIR);
}

async function readJson(filePath, fallback) {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

function auditPath(auditId) {
  return path.join(AUDITS_DIR, `${auditId}.json`);
}

export async function createAuditRecord(audit) {
  await ensureStorage();
  await writeJson(auditPath(audit.id), audit);
  return audit;
}

export async function updateAuditRecord(auditId, updater) {
  const current = await getAuditRecord(auditId);

  if (!current) {
    return null;
  }

  const next =
    typeof updater === "function"
      ? await updater(current)
      : {
          ...current,
          ...updater
        };

  next.updatedAt = new Date().toISOString();
  await writeJson(auditPath(auditId), next);
  return next;
}

export async function getAuditRecord(auditId) {
  await ensureStorage();
  return readJson(auditPath(auditId), null);
}

export async function listAuditRecords() {
  await ensureStorage();
  const entries = await readdir(AUDITS_DIR, { withFileTypes: true });
  const audits = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readJson(path.join(AUDITS_DIR, entry.name), null))
  );

  return audits
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

export async function writeAuditExport(auditId, fileName, contents) {
  await ensureStorage();
  const dirPath = path.join(EXPORTS_DIR, auditId);
  await ensureDir(dirPath);
  const exportPath = path.join(dirPath, fileName);
  await writeFile(exportPath, contents);
  return exportPath;
}

export function getExportPath(auditId, fileName) {
  return path.join(EXPORTS_DIR, auditId, fileName);
}

export { DATA_DIR, EXPORTS_DIR };
