export function clamp(min, value, max) {
  return Math.max(min, Math.min(value, max));
}

export function percent(part, total) {
  if (!total) {
    return 0;
  }

  return part / total;
}

export function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function toPercent(value, precision = 1) {
  return round(value * 100, precision);
}

export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value ?? ""));
}

export function severityRank(severity) {
  return {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1
  }[severity] ?? 0;
}

export function formatDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null) {
    return [];
  }

  return [value];
}

export function unique(values) {
  return [...new Set(values)];
}

export function dedupeBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
