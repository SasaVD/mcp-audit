function toDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function hubspotRequest(pathname, init = {}) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return null;
  }

  const response = await fetch(`https://api.hubapi.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HubSpot request failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function findOrCreateContact(email) {
  if (!email) {
    return null;
  }

  const search = await hubspotRequest("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: email
            }
          ]
        }
      ],
      properties: ["email", "firstname", "lastname"],
      limit: 1
    })
  });

  if (search?.results?.[0]?.id) {
    return search.results[0].id;
  }

  const created = await hubspotRequest("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: { email }
    })
  });

  return created?.id ?? null;
}

async function findOrCreateCompany(name, domain) {
  if (!name && !domain) {
    return null;
  }

  const filters = [];
  if (domain) {
    filters.push({
      propertyName: "domain",
      operator: "EQ",
      value: domain
    });
  }
  if (name) {
    filters.push({
      propertyName: "name",
      operator: "EQ",
      value: name
    });
  }

  if (filters.length) {
    const search = await hubspotRequest("/crm/v3/objects/companies/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters }],
        properties: ["name", "domain"],
        limit: 1
      })
    });

    if (search?.results?.[0]?.id) {
      return search.results[0].id;
    }
  }

  const created = await hubspotRequest("/crm/v3/objects/companies", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        name: name || domain,
        domain
      }
    })
  });

  return created?.id ?? null;
}

async function associateObject(fromType, fromId, toType, toId) {
  if (!fromId || !toId) {
    return;
  }

  await hubspotRequest(`/crm/v3/objects/${fromType}/${fromId}/associations/${toType}/${toId}/default`, {
    method: "PUT"
  });
}

async function createDeal(audit) {
  const stage = process.env.HUBSPOT_AUDIT_DEAL_STAGE || "appointmentscheduled";
  const pipeline = process.env.HUBSPOT_AUDIT_PIPELINE || "default";
  return hubspotRequest("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        dealname: `MCP Audit - ${toDomain(audit.input.url) || audit.input.url}`,
        dealstage: stage,
        pipeline,
        amount: audit.result.auditType === "snapshot" ? "0" : "2500",
        closedate: new Date().toISOString(),
        van_product: "MCP Readiness Audit",
        mcp_readiness_score: String(audit.result.overallScore),
        mcp_implementation_band: audit.result.roadmap.band
      }
    })
  });
}

export async function notifySlack(audit) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `MCP audit complete for ${audit.input.url}: ${audit.result.overallScore}/100 (${audit.result.band}), recommended ${audit.result.roadmap.band} implementation.`
    }),
    signal: AbortSignal.timeout(15_000)
  });
}

export async function syncHubSpot(audit) {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN || audit.result.auditType !== "paid") {
    return;
  }

  const contactId = await findOrCreateContact(audit.input.email ?? "");
  const companyId = await findOrCreateCompany(audit.input.company ?? "", toDomain(audit.input.url));
  const deal = await createDeal(audit);

  await Promise.all([
    associateObject("deals", deal?.id, "contacts", contactId),
    associateObject("deals", deal?.id, "companies", companyId)
  ]);
}

export async function dispatchAuditNotifications(audit) {
  const tasks = [notifySlack(audit), syncHubSpot(audit)];
  const results = await Promise.allSettled(tasks);
  return results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message ?? String(result.reason));
}
