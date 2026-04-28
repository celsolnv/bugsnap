import { escHtml } from "./utils/helpers.js";
function getReportId() {
  const url = new URL(window.location.href);
  return url.searchParams.get("report");
}

function fmt(value) {
  return String(value ?? "—");
}



async function loadReport() {
  const reportId = getReportId();
  const app = document.getElementById("app");
  if (!reportId) {
    app.innerHTML = `<div class="hero"><h1>BugSnap Viewer</h1><p class="muted">Link invalido.</p></div>`;
    return;
  }

  const stored = await chrome.storage.local.get(reportId);
  const report = stored[reportId];
  if (!report) {
    app.innerHTML = `<div class="hero"><h1>BugSnap Viewer</h1><p class="muted">Relatorio nao encontrado no armazenamento local.</p></div>`;
    return;
  }

  const logs = (report.consoleLogs || []).slice(-20).map((entry) => {
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("pt-BR") : "--:--:--";
    return `[${time}] [${String(entry.type || "log").toUpperCase()}] ${entry.args?.join(" ") || ""}`;
  }).join("\n");

  const requests = (report.networkRequests || []).slice(-20).map((entry) => {
    return `[${entry.status || "ERR"}] ${entry.url}${entry.statusText ? ` :: ${entry.statusText}` : ""}`;
  }).join("\n");

  app.innerHTML = `
    <section class="hero">
      <span class="pill">Link local</span>
      <h1>${escHtml(report.title || "Bug Report")}</h1>
      <p class="muted">${escHtml(report.description || "Sem descricao informada.")}</p>
      <div class="meta">
        <div><strong>URL</strong><br>${escHtml(report.page?.url)}</div>
        <div><strong>Pagina</strong><br>${escHtml(report.page?.title)}</div>
        <div><strong>Browser</strong><br>${escHtml(report.system?.browser)}</div>
        <div><strong>Plataforma</strong><br>${escHtml(report.system?.platform)}</div>
        <div><strong>Reportado em</strong><br>${escHtml(report.meta?.reportedAtLocal)}</div>
        <div><strong>Armazenado em</strong><br>${escHtml(report.storedAt)}</div>
      </div>
    </section>
    <div class="grid">
      <section>
        <div class="panel">
          <h2>Screenshot</h2>
          ${report.screenshot ? `<img src="${report.screenshot}" alt="Screenshot anotada">` : `<p class="muted">Sem screenshot.</p>`}
        </div>
        <div class="panel">
          <h2>Console</h2>
          <pre>${escHtml(logs || "Nenhum log capturado.")}</pre>
        </div>
      </section>
      <section>
        <div class="panel">
          <h2>Performance</h2>
          <pre>TTFB: ${escHtml(report.page?.performance?.ttfb)}ms
DOMContentLoaded: ${escHtml(report.page?.performance?.domContentLoaded)}ms
Load: ${escHtml(report.page?.performance?.loadTime)}ms</pre>
        </div>
        <div class="panel">
          <h2>Network</h2>
          <pre>${escHtml(requests || "Nenhuma requisicao capturada.")}</pre>
        </div>
      </section>
    </div>
  `;
}

loadReport();
