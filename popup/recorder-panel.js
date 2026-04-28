import { escHtml } from "../utils/helpers.js";
import { Recorder } from "../recorder/main.js";
import { getSystemInfo, getPageInfo } from "./collect.js";

export function initRecorderPanel(getTabId) {
  const btnStart = document.getElementById("rec-btn-start");
  const btnStop = document.getElementById("rec-btn-stop");
  const btnDownloadVideo = document.getElementById("rec-btn-dl-video");
  const btnDownloadJSON = document.getElementById("rec-btn-dl-json");
  const timerEl = document.getElementById("rec-timer");
  const statusEl = document.getElementById("rec-status");
  const indicatorEl = document.getElementById("rec-indicator");
  const previewEl = document.getElementById("rec-preview");
  const previewWrap = document.getElementById("rec-preview-wrap");
  const statsEl = document.getElementById("rec-stats");
  const logCountEl = document.getElementById("rec-log-count");
  const netCountEl = document.getElementById("rec-net-count");
  const durationEl = document.getElementById("rec-duration");
  const sizeEl = document.getElementById("rec-size");
  const failCountEl = document.getElementById("rec-fail-count");
  const timelineEl = document.getElementById("rec-timeline");
  const diagnosticsEl = document.getElementById("rec-diagnostics");

  let lastSession = null;
  let lastBlob = null;

  Recorder.on("onStateChange", (state) => {
    indicatorEl.className = `rec-indicator rec-indicator--${state === "awaiting-permission" ? "idle" : state}`;

    const isRecording = state === "recording";
    const isAwaiting = state === "awaiting-permission";
    const hasResult = state === "done";

    btnStart.disabled = isRecording || isAwaiting;
    btnStop.disabled = !isRecording;
    btnDownloadVideo.disabled = !hasResult;
    btnDownloadJSON.disabled = !hasResult;
  });

  Recorder.on("onStart", () => {
    previewWrap.style.display = "none";
    statsEl.style.display = "none";
    if (diagnosticsEl) diagnosticsEl.style.display = "none";
    timelineEl.innerHTML = "";
    setStatusText("Gravando... Reproduza o bug agora.");
  });

  Recorder.on("onTick", (elapsedMs) => {
    timerEl.textContent = Recorder.formatDuration(elapsedMs);
  });

  Recorder.on("onStop", (session) => {
    lastSession = session;
    lastBlob = session.blob;

    timerEl.textContent = Recorder.formatDuration(session.duration);
    previewEl.src = session.videoUrl;
    previewWrap.style.display = "block";

    const sizeMB = (session.blob.size / 1024 / 1024).toFixed(1);
    durationEl.textContent = Recorder.formatDuration(session.duration);
    sizeEl.textContent = `${sizeMB} MB`;
    logCountEl.textContent = session.summary.totalLogs;
    netCountEl.textContent = session.summary.totalRequests;
    failCountEl.textContent = session.summary.failedRequests;
    statsEl.style.display = "grid";

    renderDiagnostics(session.debugDiagnostics);
    renderTimeline(session);
    setStatusText("Gravação concluída. Baixe o vídeo e o relatório da sessão.");
  });

  Recorder.on("onError", (message) => {
    setStatusText(message, true);
  });

  btnStart.addEventListener("click", async () => {
    const tabId = await getTabId();
    if (!tabId) {
      setStatusText("Não foi possível identificar a aba.", true);
      return;
    }

    setStatusText("Aguardando permissão de gravação...");
    await Recorder.start(tabId);
  });

  btnStop.addEventListener("click", () => {
    setStatusText("Encerrando gravação...");
    Recorder.stop();
  });

  btnDownloadVideo.addEventListener("click", () => {
    if (!lastBlob || !lastSession) return;
    Recorder.downloadVideo(lastBlob, lastSession.mimeType);
  });

  btnDownloadJSON.addEventListener("click", async () => {
    if (!lastSession) return;
    const payload = await buildSessionPayload(lastSession);
    Recorder.downloadSessionJSON(payload);
  });

  function setStatusText(text, isError = false) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? "var(--accent)" : "var(--muted)";
  }

  async function buildSessionPayload(session) {
    const system = getSystemInfo();
    const page = await getPageInfo(session.tabId);

    return {
      meta: {
        tool: "BugSnap",
        version: "1.0.0",
        type: "screen-recording-session",
        tabId: session.tabId,
        startedAt: session.startedAt,
        duration: session.duration,
        durationFormatted: Recorder.formatDuration(session.duration),
        exportedAt: new Date().toISOString(),
      },
      page,
      system,
      consoleLogs: session.consoleLogs,
      networkRequests: session.networkRequests,
      summary: session.summary,
      debugDiagnostics: session.debugDiagnostics,
    };
  }

  function renderDiagnostics(diagnostics) {
    if (!diagnosticsEl) return;

    const parts = [
      `bridge console: ${diagnostics.bridgeConsoleCount ?? 0}`,
      `bridge network: ${diagnostics.bridgeNetworkCount ?? 0}`,
      `main console: ${diagnostics.mainWorldConsoleCount ?? 0}`,
      `main network: ${diagnostics.mainWorldNetworkCount ?? 0}`,
      `debugger console: ${diagnostics.debuggerConsoleCount ?? 0}`,
      `debugger network: ${diagnostics.debuggerNetworkCount ?? 0}`,
    ];

    diagnosticsEl.textContent = parts.join(" · ");
    diagnosticsEl.style.display = "block";
  }

  function renderTimeline(session) {
    timelineEl.innerHTML = "";
    if (!session.duration) return;

    const allEvents = [
      ...session.consoleLogs.map((entry) => ({
        type: entry.type === "error" ? "error" : entry.type === "warn" || entry.type === "warning" ? "warn" : "log",
        offset: entry._offsetMs ?? 0,
        label: entry.args?.join(" ")?.slice(0, 80) ?? "",
      })),
      ...session.networkRequests.map((entry) => ({
        type: entry.status >= 400 || entry.failed ? "net-error" : "net-ok",
        offset: entry._offsetMs ?? 0,
        label: `${entry.status || "ERR"} ${String(entry.url || "").split("?")[0].slice(-80)}`,
      })),
    ].sort((a, b) => a.offset - b.offset);

    if (allEvents.length === 0) {
      timelineEl.innerHTML = '<div class="timeline-empty">Nenhum evento capturado durante a gravação</div>';
      return;
    }

    const track = document.createElement("div");
    track.className = "timeline-track";

    allEvents.forEach((event) => {
      const pct = Math.min(100, (event.offset / session.duration) * 100);
      const dot = document.createElement("div");
      dot.className = `timeline-dot timeline-dot--${event.type}`;
      dot.style.left = `${pct}%`;
      dot.title = `${Recorder.formatDuration(event.offset)} — ${event.label}`;
      track.appendChild(dot);
    });

    timelineEl.appendChild(track);

    const relevantEvents = allEvents
      .filter((event) => event.type === "error" || event.type === "warn" || event.type === "net-error")
      .slice(-8);

    if (relevantEvents.length > 0) {
      const list = document.createElement("div");
      list.className = "timeline-events";
      relevantEvents.forEach((event) => {
        const item = document.createElement("div");
        item.className = `timeline-event timeline-event--${event.type}`;
        item.innerHTML = `<span class="tl-time">${Recorder.formatDuration(event.offset)}</span><span class="tl-label">${escHtml(event.label)}</span>`;
        list.appendChild(item);
      });
      timelineEl.appendChild(list);
    }
  }

  
}
