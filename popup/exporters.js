import { $, fmtInlineCode, fmtLogLine, fmtTable, fmtText } from "../utils/helpers.js";

export function exportJSON(data, screenshot, annotations) {
  const payload = {
    ...data,
    screenshot,
    description: $("bug-description").value.trim() || null,
    title: $("bug-title").value.trim() || "Bug Report",
    annotations,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const domain = new URL(data.page?.url || "https://unknown").hostname.replace("www.", "");
  const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  a.download = `bugsnap-${domain}-${date}.json`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportMarkdown(data) {
  const desc = $("bug-description").value.trim();
  const title = $("bug-title").value.trim() || "Bug Report";
  const consoleErrors = data.consoleLogs.filter((l) => l.type === "error").slice(-10);
  const consoleWarnings = data.consoleLogs.filter((l) => l.type === "warning").slice(-10);
  const recentLogs = data.consoleLogs.slice(-15);
  const failedReqs = data.networkRequests.filter((r) => r.status >= 400 || r.failed).slice(-10);
  const recentReqs = data.networkRequests.slice(-15);
  const keyReqs = pickKeyRequests(data.networkRequests);
  const steps = desc
    ? desc.split("\n").map((line) => line.trim()).filter(Boolean)
    : [];
  const diagnosis = buildDiagnosis(data);
  const diagnostics = data.debugDiagnostics || {};
  const hasEmptyDebug = data.consoleLogs.length === 0 || data.networkRequests.length === 0;

  let md = `# ${title}\n\n`;
  md += `## Resumo\n\n`;
  md += `- Status geral: ${buildOverallStatus(data, consoleErrors, failedReqs)}\n`;
  md += `- URL: ${fmtInlineCode(data.page?.url)}\n`;
  md += `- Pagina: ${fmtText(data.page?.title)}\n`;
  md += `- Reportado em: ${fmtText(data.meta.reportedAtLocal)}\n`;
  md += `- Browser: ${fmtText(data.system.browser)}\n`;
  md += `- Plataforma: ${fmtText(data.system.platform)}\n`;
  md += `- Screenshot capturada: ${data.hasScreenshot ? "sim" : "nao"}\n`;
  md += `- Logs coletados: ${data.consoleLogs.length}\n`;
  md += `- Requisicoes coletadas: ${data.networkRequests.length}\n\n`;

  md += `## Descricao\n\n`;
  md += `${desc || "_Sem descricao informada._"}\n\n`;

  md += `## Diagnostico rapido\n\n`;
  md += `- Comportamento esperado: _Nao informado._\n`;
  md += `- Comportamento obtido: ${diagnosis.observed}\n`;
  md += `- Impacto percebido: ${diagnosis.impact}\n\n`;

  md += `## Passos observados\n\n`;
  if (steps.length > 0) {
    steps.forEach((step, index) => {
      md += `${index + 1}. ${fmtText(step)}\n`;
    });
  } else {
    md += `1. Abrir a pagina afetada.\n2. Executar a acao que dispara o problema.\n3. Comparar o resultado obtido com o esperado.\n`;
  }
  md += `\n`;

  md += `## Ambiente\n\n`;
  md += `| Campo | Valor |\n|---|---|\n`;
  md += `| URL | ${fmtInlineCode(data.page?.url)} |\n`;
  md += `| Pagina | ${fmtTable(data.page?.title)} |\n`;
  md += `| Browser | ${fmtTable(data.system.browser)} |\n`;
  md += `| Plataforma | ${fmtTable(data.system.platform)} |\n`;
  md += `| Resolucao | ${fmtTable(`${data.system.screenWidth}x${data.system.screenHeight}`)} |\n`;
  md += `| Viewport | ${fmtTable(`${data.page?.viewportWidth ?? "?"}x${data.page?.viewportHeight ?? "?"}`)} |\n`;
  md += `| Documento | ${fmtTable(`${data.page?.documentWidth ?? "?"}x${data.page?.documentHeight ?? "?"}`)} |\n`;
  md += `| Idioma | ${fmtTable(data.system.language)} |\n`;
  md += `| Fuso horario | ${fmtTable(data.system.timezone)} |\n`;
  md += `| Conexao | ${fmtTable(data.system.connection)} |\n`;
  md += `| Online | ${fmtTable(String(data.system.onLine))} |\n`;
  md += `| Cookies habilitados | ${fmtTable(String(data.system.cookiesEnabled))} |\n`;
  md += `| Estado da pagina | ${fmtTable(data.page?.readyState)} |\n`;
  md += `| Referrer | ${fmtTable(data.page?.referrer || "—")} |\n`;
  md += `| Scroll | ${fmtTable(`${data.page?.scrollX ?? 0}, ${data.page?.scrollY ?? 0}`)} |\n`;
  md += `| Reportado em | ${fmtTable(data.meta.reportedAtLocal)} |\n\n`;

  md += `## Performance\n\n`;
  if (data.page?.performance) {
    const p = data.page.performance;
    md += `| Metrica | Valor |\n|---|---|\n`;
    md += `| TTFB | ${fmtTable(`${p.ttfb}ms`)} |\n`;
    md += `| DOMContentLoaded | ${fmtTable(`${p.domContentLoaded}ms`)} |\n`;
    md += `| Load | ${fmtTable(`${p.loadTime}ms`)} |\n\n`;
  } else {
    md += `_Sem dados de performance disponiveis._\n\n`;
  }

  md += `## Sinais principais\n\n`;
  diagnosis.highlights.forEach((item) => {
    md += `- ${item}\n`;
  });
  md += `\n`;

  md += `## Console\n\n`;
  md += `- Erros: ${consoleErrors.length}\n- Warnings: ${consoleWarnings.length}\n- Total de entradas: ${data.consoleLogs.length}\n\n`;
  if (recentLogs.length > 0) {
    md += "```text\n";
    recentLogs.forEach((entry) => {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("pt-BR") : "--:--:--";
      md += `[${time}] [${String(entry.type || "log").toUpperCase()}] ${fmtLogLine(entry.args?.join(" "))}\n`;
    });
    md += "```\n\n";
  } else {
    md += `_Nenhum log capturado nesta coleta._\n\n`;
  }

  md += `## Network\n\n`;
  md += `- Falhas: ${failedReqs.length}\n- Total de requisicoes observadas: ${data.networkRequests.length}\n\n`;
  if (keyReqs.length > 0) {
    md += `### Requests principais\n\n`;
    keyReqs.forEach((req, index) => {
      md += `${index + 1}. ${formatRequestHeadline(req)}\n`;
      if (req.queryParams) {
        md += `   Query: ${fmtText(Object.keys(req.queryParams).join(", "))}\n`;
      }
      if (req.requestBody?.kind) {
        md += `   Body: ${fmtText(req.requestBody.kind)}${req.truncated ? " (truncado)" : ""}\n`;
      }
      if (req.timestamp) {
        md += `   Horario: ${fmtText(new Date(req.timestamp).toLocaleTimeString("pt-BR"))}\n`;
      }
    });
    md += `\n`;
  }
  if (recentReqs.length > 0) {
    md += "```text\n";
    recentReqs.forEach((req) => {
      md += `${formatRequestLine(req)}\n`;
    });
    md += "```\n\n";
  } else {
    md += `_Nenhuma requisicao capturada._\n\n`;
  }

  if (failedReqs.length > 0) {
    md += `## Requisicoes com erro\n\n\`\`\`text\n`;
    failedReqs.forEach((req) => {
      md += `${formatRequestLine(req)}\n`;
    });
    md += "```\n\n";
  }

  if (hasEmptyDebug) {
    md += `## Diagnostico da captura\n\n`;
    md += `- Bridge console: ${diagnostics.bridgeConsoleCount ?? 0}\n`;
    md += `- Bridge network: ${diagnostics.bridgeNetworkCount ?? 0}\n`;
    md += `- Main-world console: ${diagnostics.mainWorldConsoleCount ?? 0}\n`;
    md += `- Main-world network: ${diagnostics.mainWorldNetworkCount ?? 0}\n`;
    if (diagnostics.mainWorldVersion) {
      md += `- Versao do coletor principal: ${fmtText(diagnostics.mainWorldVersion)}\n`;
    }
    if (diagnostics.mainWorldBootedAt) {
      md += `- Inicializado em: ${fmtText(diagnostics.mainWorldBootedAt)}\n`;
    }
    md += `\n`;
  }

  md += `## Anexos\n\n`;
  md += `- Screenshot: ${data.hasScreenshot ? "disponivel no export JSON e na visualizacao do popup" : "nao capturada"}\n`;
  md += `- Momento da captura: ${fmtText(data.meta.reportedAtLocal)}\n`;
  md += `- Export JSON: inclui metadados completos, logs, network e screenshot em base64\n\n`;
  md += `---\nGerado pelo BugSnap ${data.meta.bugSnapVersion} em ${data.meta.reportedAtLocal}.\n`;

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = `bugsnap-${new Date().toISOString().slice(0, 10)}.md`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

function buildOverallStatus(data, consoleErrors, failedReqs) {
  if (consoleErrors.length > 0 || failedReqs.length > 0) {
    return `${consoleErrors.length} erro(s) de console e ${failedReqs.length} falha(s) de rede`;
  }

  if (data.networkRequests.length > 0) {
    return `sem erros aparentes, com ${data.networkRequests.length} requisicao(oes) observada(s)`;
  }

  return "captura sem erros aparentes e sem sinais fortes de debug";
}

function buildDiagnosis(data) {
  const networkWithSearch = data.networkRequests.filter((req) => req.hasQueryParams);
  const mainEndpoint = pickKeyRequests(data.networkRequests)[0];
  const observed =
    mainEndpoint?.url
      ? `atividade principal observada em ${fmtText(mainEndpoint.url)}`
      : data.networkRequests.length > 0
        ? `${data.networkRequests.length} requisicao(oes) observada(s) na pagina`
        : "sem evento de rede ou console marcante nesta coleta";

  const impact =
    data.consoleLogs.length > 0 || data.networkRequests.length > 0
      ? "o relatorio mostra sinais tecnicos para investigar o fluxo afetado"
      : "o problema depende mais do comportamento visual/funcional do que de sinais tecnicos capturados";

  const highlights = [];
  highlights.push(`Console: ${data.consoleLogs.length} entrada(s), ${data.consoleLogs.filter((l) => l.type === "error").length} erro(s).`);
  highlights.push(`Network: ${data.networkRequests.length} requisicao(oes), ${data.networkRequests.filter((r) => r.failed || r.status >= 400).length} falha(s).`);
  if (networkWithSearch.length > 0) {
    highlights.push(`Requests com query params: ${networkWithSearch.length}.`);
  }
  if (mainEndpoint?.url) {
    highlights.push(`Endpoint mais relevante na coleta: ${fmtText(mainEndpoint.url)}.`);
  }

  return { observed, impact, highlights };
}

function pickKeyRequests(requests) {
  return requests
    .slice()
    .sort((a, b) => scoreRequest(b) - scoreRequest(a))
    .slice(0, 3);
}

function scoreRequest(req) {
  let score = 0;
  if (req.failed || req.status >= 400) score += 100;
  if (req.hasRequestBody) score += 20;
  if (req.hasQueryParams) score += 15;
  if (req.initiator === "xhr" || req.initiator === "fetch") score += 10;
  if (req.timestamp) score += new Date(req.timestamp).getTime() / 1e13;
  return score;
}

function formatRequestHeadline(req) {
  const method = String(req.method || "GET").toUpperCase();
  const initiator = req.initiator ? ` ${req.initiator}` : "";
  return `[${req.status || "ERR"}] [${method}${initiator}] ${fmtText(req.url)}`;
}

function formatRequestLine(req) {
  const method = String(req.method || "GET").toUpperCase();
  const initiator = req.initiator ? ` ${req.initiator}` : "";
  const queryKeys = req.queryParams ? Object.keys(req.queryParams).join(",") : "";
  const bodyKind = req.requestBody?.kind ? ` body:${req.requestBody.kind}` : "";
  const time = req.timestamp ? ` at:${new Date(req.timestamp).toLocaleTimeString("pt-BR")}` : "";
  const flags = [
    queryKeys ? `query:${queryKeys}` : null,
    bodyKind ? bodyKind.trim() : null,
    req.truncated ? "truncated" : null,
    time ? time.trim() : null,
  ]
    .filter(Boolean)
    .join(",");
  return `[${req.status || "ERR"}] [${method}${initiator}${flags ? ` ${flags}` : ""}] ${fmtLogLine(req.url)}${req.statusText ? ` :: ${fmtLogLine(req.statusText)}` : ""}`;
}

export function copyToClipboard(data) {
  const desc = $("bug-description").value.trim();
  const title = $("bug-title").value.trim() || "Bug Report";
  const errors = data.consoleLogs.filter((l) => l.type === "error").slice(-5);
  const failedReqs = data.networkRequests.filter((r) => r.status >= 400 || r.failed).slice(-5);

  let text = `🐛 ${title}\n`;
  if (desc) text += `\n${desc}\n`;
  text += `\n📍 URL: ${data.page?.url}`;
  text += `\n🌐 ${data.system.browser} · ${data.system.platform}`;
  text += `\n🖥️ ${data.system.screenWidth}×${data.system.screenHeight}`;
  text += `\n🕐 ${data.meta.reportedAtLocal}`;

  if (errors.length > 0) {
    text += `\n\n❌ Erros:\n${errors.map((e) => `• ${e.args?.join(" ")}`).join("\n")}`;
  }
  if (failedReqs.length > 0) {
    text += `\n\n🔴 Requests com erro:\n${failedReqs.map((r) => `• ${r.status} ${r.url}`).join("\n")}`;
  }

  return navigator.clipboard.writeText(text).then(() => {
    const btn = $("btn-copy");
    btn.textContent = "✓ Copiado!";
    btn.style.background = "#22c55e";
    setTimeout(() => {
      btn.textContent = "Copiar resumo";
      btn.style.background = "";
    }, 2000);
  });
}
