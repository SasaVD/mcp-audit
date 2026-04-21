const BASE_URL = "https://api.webflow.com";

export class WebflowApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.name = "WebflowApiError";
    this.status = status;
    this.body = body;
  }
}

export class WebflowClient {
  constructor(token) {
    this.token = token;
  }

  async request(pathname, init = {}, attempt = 0) {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "content-type": "application/json",
        "user-agent": "mcp-audit/0.1",
        ...(init.headers ?? {})
      },
      signal: AbortSignal.timeout(20_000)
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.request(pathname, init, attempt + 1);
    }

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }

      throw new WebflowApiError(
        `Webflow request failed for ${pathname} with ${response.status}`,
        response.status,
        body
      );
    }

    return response.json();
  }

  listSites() {
    return this.request("/v2/sites");
  }

  getSite(siteId) {
    return this.request(`/v2/sites/${siteId}`);
  }

  getPages(siteId) {
    return this.request(`/v2/sites/${siteId}/pages`);
  }

  getPageDom(pageId) {
    return this.request(`/v2/pages/${pageId}/dom`);
  }

  getCollections(siteId) {
    return this.request(`/v2/sites/${siteId}/collections`);
  }

  getCollection(collectionId) {
    return this.request(`/v2/collections/${collectionId}`);
  }

  getComponents(siteId) {
    return this.request(`/v2/sites/${siteId}/components`);
  }

  getAssets(siteId) {
    return this.request(`/v2/sites/${siteId}/assets`);
  }

  getCustomCode(siteId) {
    return this.request(`/v2/sites/${siteId}/custom_code`);
  }

  getRegisteredScripts(siteId) {
    return this.request(`/v2/sites/${siteId}/registered_scripts`);
  }
}
