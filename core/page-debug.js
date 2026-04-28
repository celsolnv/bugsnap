(() => {
  const PAGE_FLAG = "__BUGSNAP_PAGE_INSTRUMENTED__";
  const SOURCE = "BUGSNAP_PAGE_EVENT";
  const STORE_KEY = "__BUGSNAP_DEBUG_STORE__";
  const MAX_CONSOLE_LOGS = 200;
  const MAX_NETWORK_REQUESTS = 100;
  const MAX_TEXT_LENGTH = 1800;
  const MAX_JSON_LENGTH = 2400;

  if (window[PAGE_FLAG]) return;
  window[PAGE_FLAG] = true;

  const store = (window[STORE_KEY] = window[STORE_KEY] || {
    consoleLogs: [],
    networkRequests: [],
    bootedAt: new Date().toISOString(),
    version: "main-world-v2",
  });

  const emit = (payload) => {
    window.postMessage({ source: SOURCE, payload }, "*");
  };

  const pushConsole = (entry) => {
    store.consoleLogs.push(entry);
    while (store.consoleLogs.length > MAX_CONSOLE_LOGS) store.consoleLogs.shift();
    emit({ kind: "console", entry });
  };

  const pushNetwork = (entry) => {
    store.networkRequests.push(entry);
    while (store.networkRequests.length > MAX_NETWORK_REQUESTS) store.networkRequests.shift();
    emit({ kind: "network", entry });
  };

  const serialize = (value) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const truncateText = (value, max = MAX_TEXT_LENGTH) => {
    const text = String(value ?? "");
    if (text.length <= max) return { value: text, truncated: false };
    return { value: `${text.slice(0, max)}…`, truncated: true };
  };

  const safeJson = (value) => {
    try {
      const serialized = JSON.stringify(value, null, 2);
      return truncateText(serialized, MAX_JSON_LENGTH);
    } catch {
      return truncateText(String(value), MAX_JSON_LENGTH);
    }
  };

  const normalizeParsedValue = (value) => {
    if (value == null) return { value: null, truncated: false };
    const preview = safeJson(value);
    if (!preview.truncated) return { value, truncated: false };
    return { value: preview.value, truncated: true };
  };

  const paramsToObject = (searchParams) => {
    const out = {};
    for (const [key, value] of searchParams.entries()) {
      if (key in out) {
        out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  const normalizeHeaders = (headersLike) => {
    if (!headersLike) return null;
    const out = {};

    try {
      if (headersLike instanceof Headers) {
        headersLike.forEach((value, key) => {
          out[key] = truncateText(value, 400).value;
        });
        return Object.keys(out).length ? out : null;
      }

      if (Array.isArray(headersLike)) {
        headersLike.forEach(([key, value]) => {
          out[String(key).toLowerCase()] = truncateText(value, 400).value;
        });
        return Object.keys(out).length ? out : null;
      }

      Object.entries(headersLike).forEach(([key, value]) => {
        out[String(key).toLowerCase()] = truncateText(value, 400).value;
      });
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  };

  const normalizeBody = (body, headers) => {
    if (body == null) return null;
    const contentType = headers?.["content-type"] || headers?.["Content-Type"] || null;

    if (typeof body === "string") {
      const raw = truncateText(body);
      const parsed = normalizeParsedValue(tryParseTextBody(body, contentType));
      return {
        kind: contentType?.includes("json") ? "json-text" : "text",
        raw: raw.value,
        parsed: parsed.value,
        truncated: raw.truncated || parsed.truncated,
      };
    }

    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      const parsed = paramsToObject(body);
      const preview = safeJson(parsed);
      return {
        kind: "urlencoded",
        raw: preview.value,
        parsed: preview.truncated ? preview.value : parsed,
        truncated: preview.truncated,
      };
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const parsed = {};
      body.forEach((value, key) => {
        const normalized = value instanceof File ? `[File:${value.name}]` : String(value);
        if (key in parsed) {
          parsed[key] = Array.isArray(parsed[key]) ? [...parsed[key], normalized] : [parsed[key], normalized];
        } else {
          parsed[key] = normalized;
        }
      });
      const preview = safeJson(parsed);
      return {
        kind: "form-data",
        raw: preview.value,
        parsed: preview.truncated ? preview.value : parsed,
        truncated: preview.truncated,
      };
    }

    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return {
        kind: "blob",
        raw: `[Blob ${body.type || "application/octet-stream"} ${body.size} bytes]`,
        parsed: null,
        truncated: false,
      };
    }

    if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
      return {
        kind: "array-buffer",
        raw: `[ArrayBuffer ${body.byteLength} bytes]`,
        parsed: null,
        truncated: false,
      };
    }

    if (ArrayBuffer.isView(body)) {
      return {
        kind: "typed-array",
        raw: `[TypedArray ${body.byteLength} bytes]`,
        parsed: null,
        truncated: false,
      };
    }

    const preview = safeJson(body);
    return {
      kind: "unknown",
      raw: preview.value,
      parsed: null,
      truncated: preview.truncated,
    };
  };

  const tryParseTextBody = (text, contentType) => {
    const isJson = contentType?.includes("json") || /^[\[{]/.test(text.trim());
    if (isJson) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    const isFormEncoded = contentType?.includes("application/x-www-form-urlencoded");
    if (isFormEncoded) {
      try {
        return paramsToObject(new URLSearchParams(text));
      } catch {
        return null;
      }
    }

    return null;
  };

  const normalizeUrlData = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      const query = paramsToObject(parsed.searchParams);
      return {
        url: parsed.toString(),
        queryParams: Object.keys(query).length ? query : null,
      };
    } catch {
      return {
        url: String(url || ""),
        queryParams: null,
      };
    }
  };

  const buildRequestSnapshot = ({ url, method, headers, body, initiator, timestamp }) => {
    const normalizedHeaders = normalizeHeaders(headers);
    const normalizedBody = normalizeBody(body, normalizedHeaders);
    const normalizedUrl = normalizeUrlData(url);

    return {
      url: normalizedUrl.url,
      method: String(method || "GET").toUpperCase(),
      initiator,
      timestamp,
      queryParams: normalizedUrl.queryParams,
      requestHeaders: normalizedHeaders,
      requestBody: normalizedBody,
      hasQueryParams: !!normalizedUrl.queryParams,
      hasRequestBody: !!normalizedBody,
      truncated:
        !!normalizedBody?.truncated ||
        Object.values(normalizedHeaders || {}).some((value) => String(value).endsWith("…")),
    };
  };

  [
    "log",
    "info",
    "warn",
    "error",
    "debug",
    "trace",
    "dir",
    "dirxml",
    "table",
    "assert",
  ].forEach((type) => {
    const original = console[type];
    if (typeof original !== "function") return;

    console[type] = function (...args) {
      if (type === "assert" && args[0]) {
        return original.apply(this, args);
      }

      const normalizedArgs =
        type === "assert"
          ? ["Assertion failed", ...args.slice(1).map(serialize)]
          : args.map(serialize);

      pushConsole({
        type,
        timestamp: new Date().toISOString(),
        args: normalizedArgs,
      });

      return original.apply(this, args);
    };
  });

  window.addEventListener("error", (event) => {
    pushConsole({
      type: "error",
      timestamp: new Date().toISOString(),
      args: [
        event.message || "Uncaught error",
        event.filename ? "(" + event.filename + ":" + event.lineno + ")" : "",
      ],
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushConsole({
      type: "error",
      timestamp: new Date().toISOString(),
      args: ["Unhandled promise rejection", serialize(event.reason)],
    });
  });

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (...args) {
      const startedAt = new Date().toISOString();
      const input = args[0];
      const init = args[1] || {};
      const sourceUrl = typeof input === "string" ? input : input?.url || "(fetch)";
      const method = init.method || input?.method || "GET";
      const headers = normalizeHeaders(init.headers || input?.headers);
      const body = init.body !== undefined ? init.body : null;

      const baseSnapshot = buildRequestSnapshot({
        url: sourceUrl,
        method,
        headers,
        body,
        initiator: "fetch",
        timestamp: startedAt,
      });

      try {
        const response = await originalFetch.apply(this, args);
        pushNetwork({
          ...baseSnapshot,
          url: response.url || baseSnapshot.url,
          status: response.status,
          statusText: response.statusText,
        });
        return response;
      } catch (error) {
        pushNetwork({
          ...baseSnapshot,
          status: 0,
          statusText: serialize(error),
          failed: true,
        });
        throw error;
      }
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__bugsnap = {
      method: method || "GET",
      url: url || "(xhr)",
      headers: {},
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    if (this.__bugsnap) {
      this.__bugsnap.headers[String(key).toLowerCase()] = truncateText(value, 400).value;
    }
    return originalSetRequestHeader.call(this, key, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const meta = this.__bugsnap || { method: "GET", url: "(xhr)", headers: {} };
    const startedAt = new Date().toISOString();
    const body = args[0];
    const baseSnapshot = buildRequestSnapshot({
      url: meta.url,
      method: meta.method,
      headers: meta.headers,
      body,
      initiator: "xhr",
      timestamp: startedAt,
    });

    this.addEventListener("loadend", () => {
      pushNetwork({
        ...baseSnapshot,
        url: this.responseURL || baseSnapshot.url,
        status: this.status,
        statusText: this.statusText,
        failed: this.status === 0,
      });
    });
    return originalSend.apply(this, args);
  };
})();
