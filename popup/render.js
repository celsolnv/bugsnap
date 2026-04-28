import { $, escHtml } from "../utils/helpers.js";

const debugState = {
  consoleLogs: [],
  networkRequests: [],
  diagnostics: {},
};

export function initDebugPanels({ onClearDebug } = {}) {
  $("console-search").addEventListener("input", renderConsolePanel);
  $("console-filter").addEventListener("change", renderConsolePanel);
  $("network-search").addEventListener("input", renderNetworkPanel);
  $("network-filter").addEventListener("change", renderNetworkPanel);
  $("btn-clear-console").addEventListener("click", () => onClearDebug?.());
  $("btn-clear-network").addEventListener("click", () => onClearDebug?.());
}

export function renderReport(data, screenshot) {
  const url = data.page?.url ?? "—";
  const title = data.page?.title ?? "—";
  $("page-url").textContent = url.length > 60 ? url.slice(0, 60) + "…" : url;
  $("page-url").title = url;
  $("page-title").textContent = title;
  $("page-time").textContent = data.page?.localTime ?? data.meta.reportedAtLocal;

  $("sys-browser").textContent = data.system.browser;
  $("sys-os").textContent = data.system.platform;
  $("sys-screen").textContent = `${data.system.screenWidth}×${data.system.screenHeight} @${data.system.devicePixelRatio}x`;
  $("sys-viewport").textContent = data.page?.viewportWidth
    ? `${data.page.viewportWidth}×${data.page.viewportHeight}`
    : "—";
  $("sys-connection").textContent = data.system.connection;
  $("sys-lang").textContent = data.system.language;

  if (data.page?.performance) {
    const p = data.page.performance;
    $("sys-perf").textContent = `TTFB ${p.ttfb}ms · DOMContentLoaded ${p.domContentLoaded}ms · Load ${p.loadTime}ms`;
  } else {
    $("sys-perf").textContent = "N/A";
  }

  debugState.consoleLogs = data.consoleLogs ?? [];
  debugState.networkRequests = data.networkRequests ?? [];
  debugState.diagnostics = data.debugDiagnostics ?? {};

  renderConsolePanel();
  renderNetworkPanel();
  renderScreenshot(screenshot);
}

function renderConsolePanel() {
  const logs = debugState.consoleLogs;
  const query = $("console-search").value.trim().toLowerCase();
  const filter = $("console-filter").value;
  const filtered = logs.filter((entry) => matchConsoleFilter(entry, filter) && matchConsoleSearch(entry, query));

  $("console-count").textContent = logs.length;
  renderConsoleSummary(logs);
  renderDiagnostics("console", logs.length === 0);

  const consoleList = $("console-list");
  consoleList.innerHTML = "";

  if (filtered.length === 0) {
    consoleList.innerHTML = `<div class="empty-state">${
      logs.length === 0 ? "Nenhum log capturado até agora" : "Nenhum log corresponde ao filtro atual"
    }</div>`;
    return;
  }

  filtered
    .slice()
    .reverse()
    .slice(0, 80)
    .forEach((log) => {
      const el = document.createElement("div");
      el.className = `log-entry log-${normalizeConsoleType(log.type)}`;
      const badge = `<span class="log-badge">${escHtml(String(log.type || "log").toUpperCase())}</span>`;
      const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString("pt-BR") : "";
      const msg = (log.args || []).join(" ") || "—";
      el.innerHTML = `${badge}<span class="log-time">${time}</span><span class="log-msg">${escHtml(msg)}</span>`;
      consoleList.appendChild(el);
    });
}

function renderConsoleSummary(logs) {
  const counts = {
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
    trace: 0,
    other: 0,
  };

  logs.forEach((entry) => {
    const type = normalizeConsoleType(entry.type);
    if (counts[type] !== undefined) counts[type] += 1;
    else counts.other += 1;
  });

  $("console-summary").innerHTML = [
    `Total ${logs.length}`,
    `Erros ${counts.error}`,
    `Warnings ${counts.warning}`,
    `Info ${counts.info + countExact(logs, "log")}`,
    `Debug ${counts.debug}`,
    `Trace ${counts.trace}`,
  ]
    .map((label) => `<span class="debug-pill">${escHtml(label)}</span>`)
    .join("");
}

function renderNetworkPanel() {
  const requests = debugState.networkRequests;
  const query = $("network-search").value.trim().toLowerCase();
  const filter = $("network-filter").value;
  const filtered = requests.filter((entry) => matchNetworkFilter(entry, filter) && matchNetworkSearch(entry, query));

  $("network-count").textContent = requests.length;
  renderNetworkSummary(requests);
  renderDiagnostics("network", requests.length === 0);

  const netList = $("network-list");
  netList.innerHTML = "";

  if (filtered.length === 0) {
    netList.innerHTML = `<div class="empty-state">${
      requests.length === 0 ? "Nenhuma requisição capturada até agora" : "Nenhuma requisição corresponde ao filtro atual"
    }</div>`;
    return;
  }

  filtered
    .slice()
    .reverse()
    .slice(0, 80)
    .forEach((req) => {
      const wrapper = document.createElement("details");
      wrapper.className = "net-details";

      const isError = req.status >= 400 || req.failed;
      const status = req.status || "ERR";
      const method = (req.method || "GET").toUpperCase();
      const shortUrl = req.url.length > 68 ? req.url.slice(0, 68) + "…" : req.url;
      const detail = [method, req.initiator || inferInitiator(req), req.statusText].filter(Boolean).join(" · ");
      const pills = [
        req.hasQueryParams ? "query" : null,
        req.hasRequestBody ? "body" : null,
        req.truncated ? "truncado" : null,
      ]
        .filter(Boolean)
        .map((label) => `<span class="debug-pill">${escHtml(label)}</span>`)
        .join("");

      wrapper.innerHTML = `
        <summary class="net-summary">
          <span class="net-status ${isError ? "status-error" : "status-ok"}">${escHtml(String(status))}</span>
          <span class="net-meta">${escHtml(detail)}</span>
          <span class="net-url" title="${escHtml(req.url)}">${escHtml(shortUrl)}</span>
        </summary>
        <div class="net-body">
          <div class="net-pill-row">${pills || '<span class="net-empty">Sem metadados extras</span>'}</div>
          ${renderNetworkBlock("URL completa", req.url)}
          ${renderNetworkBlock("Timestamp", req.timestamp || "—")}
          ${renderNetworkBlock("Query params", req.queryParams)}
          ${renderNetworkBlock("Headers", req.requestHeaders)}
          ${renderNetworkBlock("Request body", req.requestBody)}
        </div>
      `;

      netList.appendChild(wrapper);
    });
}

function renderNetworkSummary(requests) {
  const failed = requests.filter((req) => req.failed || req.status >= 400).length;
  const xhr = requests.filter((req) => inferInitiator(req) === "xhr").length;
  const fetch = requests.filter((req) => inferInitiator(req) === "fetch").length;
  const withQuery = requests.filter((req) => req.hasQueryParams).length;
  const withBody = requests.filter((req) => req.hasRequestBody).length;
  const truncated = requests.filter((req) => req.truncated).length;

  $("network-summary").innerHTML = [
    `Total ${requests.length}`,
    `Falhas ${failed}`,
    `XHR ${xhr}`,
    `Fetch ${fetch}`,
    `Body ${withBody}`,
    `Query ${withQuery}`,
    `Truncado ${truncated}`,
  ]
    .map((label) => `<span class="debug-pill">${escHtml(label)}</span>`)
    .join("");
}

function renderDiagnostics(panel, visible) {
  const el = $(`${panel}-diagnostics`);
  if (!el) return;

  if (!visible) {
    el.classList.remove("visible");
    el.innerHTML = "";
    return;
  }

  el.classList.add("visible");
  el.innerHTML = `
    <strong>Diagnóstico:</strong>
    bridge console ${escHtml(String(debugState.diagnostics.bridgeConsoleCount ?? 0))},
    bridge network ${escHtml(String(debugState.diagnostics.bridgeNetworkCount ?? 0))},
    main-world console ${escHtml(String(debugState.diagnostics.mainWorldConsoleCount ?? 0))},
    main-world network ${escHtml(String(debugState.diagnostics.mainWorldNetworkCount ?? 0))}
    ${debugState.diagnostics.mainWorldVersion ? `· versão ${escHtml(debugState.diagnostics.mainWorldVersion)}` : ""}
  `;
}

function renderNetworkBlock(label, value) {
  if (
    value == null ||
    value === "" ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
  ) {
    return `
      <div class="net-block">
        <div class="net-label">${escHtml(label)}</div>
        <div class="net-empty">Sem dados</div>
      </div>
    `;
  }

  return `
    <div class="net-block">
      <div class="net-label">${escHtml(label)}</div>
      <pre class="net-pre">${escHtml(formatValue(value))}</pre>
    </div>
  `;
}

function formatValue(value) {
  if (typeof value === "string") return value;

  if (value && typeof value === "object" && "raw" in value && "kind" in value) {
    const parts = [`kind: ${value.kind}`];
    if (value.truncated) parts.push("truncated: true");
    if (value.parsed) {
      parts.push("");
      parts.push("parsed:");
      parts.push(toPrettyJson(value.parsed));
    }
    if (value.raw) {
      parts.push("");
      parts.push("raw:");
      parts.push(value.raw);
    }
    return parts.join("\n");
  }

  return toPrettyJson(value);
}

function toPrettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderScreenshot(screenshot) {
  if (!screenshot) return;
  $("screenshot-img").src = screenshot;
  $("screenshot-placeholder").style.display = "none";
  $("screenshot-img").style.display = "block";
  $("annotation-canvas").style.display = "block";
}

function normalizeConsoleType(type) {
  if (type === "warn") return "warning";
  if (type === "log" || type === "info") return type;
  if (type === "error" || type === "debug" || type === "trace") return type;
  return "other";
}

function matchConsoleFilter(entry, filter) {
  if (filter === "all") return true;
  const type = normalizeConsoleType(entry.type);
  if (filter === "other") return !["error", "warning", "info", "debug", "trace", "log"].includes(entry.type);
  if (filter === "info") return entry.type === "info" || entry.type === "log";
  return type === filter;
}

function matchConsoleSearch(entry, query) {
  if (!query) return true;
  const haystack = `${entry.type || ""} ${(entry.args || []).join(" ")}`.toLowerCase();
  return haystack.includes(query);
}

function matchNetworkFilter(entry, filter) {
  const status = Number(entry.status || 0);
  const initiator = inferInitiator(entry);
  if (filter === "all") return true;
  if (filter === "failed") return !!entry.failed || status === 0 || status >= 400;
  if (filter === "4xx") return status >= 400 && status < 500;
  if (filter === "5xx") return status >= 500;
  if (filter === "xhr" || filter === "fetch") return initiator === filter;
  return true;
}

function matchNetworkSearch(entry, query) {
  if (!query) return true;
  const queryBlob = entry.queryParams ? JSON.stringify(entry.queryParams) : "";
  const bodyBlob = entry.requestBody?.raw || "";
  const haystack =
    `${entry.url || ""} ${entry.status || ""} ${entry.statusText || ""} ${entry.method || ""} ${inferInitiator(entry)} ${queryBlob} ${bodyBlob}`.toLowerCase();
  return haystack.includes(query);
}

function inferInitiator(entry) {
  if (entry.initiator) return entry.initiator;
  if (entry.url === "(failed)") return "network";
  return entry.method ? "fetch/xhr" : "network";
}

function countExact(logs, type) {
  return logs.filter((entry) => entry.type === type).length;
}
