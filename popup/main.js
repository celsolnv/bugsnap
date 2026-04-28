import { $ } from "../utils/helpers.js";
import { clearDebugData, collectBugReport } from "./collect.js";
import { initDebugPanels, renderReport } from "./render.js";
import { createAnnotationController } from "./annotations.js";
import { copyToClipboard, exportJSON, exportMarkdown } from "./exporters.js";
import { copyShareLink, createLocalShareLink } from "./share.js";
import { initRecorderPanel } from "./recorder-panel.js";

let uiInitialized = false;
let collectedData = null;
let capturedScreenshot = null;

const annotations = createAnnotationController();

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(`panel-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function getAnnotatedScreenshot() {
  return annotations.getExportScreenshot(capturedScreenshot);
}

function buildSharePayload() {
  return {
    ...collectedData,
    screenshot: getAnnotatedScreenshot(),
    title: $("bug-title").value.trim() || "Bug Report",
    description: $("bug-description").value.trim() || null,
    annotations: annotations.getItems(),
  };
}

async function handleCopyLink() {
  if (!collectedData) return;
  const link = await createLocalShareLink(buildSharePayload());
  await copyShareLink(link);
  const btn = $("btn-link");
  btn.textContent = "✓ Link copiado";
  setTimeout(() => {
    btn.textContent = "Copiar link";
  }, 2000);
}

function initActions() {
  $("btn-json").addEventListener("click", () =>
    collectedData && exportJSON(collectedData, getAnnotatedScreenshot(), annotations.getItems())
  );
  $("btn-md").addEventListener("click", () => collectedData && exportMarkdown(collectedData));
  $("btn-copy").addEventListener("click", () => collectedData && copyToClipboard(collectedData));
  $("btn-link").addEventListener("click", handleCopyLink);
  $("btn-refresh").addEventListener("click", () => doCollect());
}

async function handleClearDebug() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await clearDebugData(tab.id);

  if (collectedData) {
    collectedData = {
      ...collectedData,
      consoleLogs: [],
      networkRequests: [],
      debugDiagnostics: {
        ...(collectedData.debugDiagnostics || {}),
        bridgeConsoleCount: 0,
        bridgeNetworkCount: 0,
        mainWorldConsoleCount: 0,
        mainWorldNetworkCount: 0,
      },
    };
    renderReport(collectedData, capturedScreenshot);
  }

  $("status").textContent = "✓ Debug limpo";
  $("status").className = "status status-ok";
}


async function doCollect() {
  $("status").textContent = "Coletando dados…";
  $("status").className = "status";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({ type: "ATTACH_TAB", tabId: tab.id });
    await new Promise((r) => setTimeout(r, 300));

    const result = await collectBugReport();
    collectedData = result.data;
    capturedScreenshot = result.screenshot;
    annotations.reset();
    renderReport(collectedData, capturedScreenshot);

    $("status").textContent = "✓ Dados coletados";
    $("status").className = "status status-ok";
    $("btn-json").disabled = false;
    $("btn-md").disabled = false;
    $("btn-copy").disabled = false;
    $("btn-link").disabled = false;
  } catch (err) {
    $("status").textContent = "Erro: " + err.message;
    $("status").className = "status status-error";
    console.error(err);
  }
}

async function startApp(action) {
  if (!uiInitialized) {
    initTabs();
    initDebugPanels({ onClearDebug: handleClearDebug });
    annotations.init();
    initRecorderPanel(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id ?? null;
    });
    initActions();
    uiInitialized = true;
  }

  document.getElementById("menu-view").style.display = "none";
  document.getElementById("editor-view").style.display = "flex";

  if (action === "screenshot") {
    await doCollect();
  } else if (action === "record") {
    // Send message to the injected content script on the page to spawn the picker + toolbar natively
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING" });
        setTimeout(() => window.close(), 100);
      } catch (err) {
        try {
          // If content script was disconnected due to extension update/reload without page refresh, inject it dynamically.
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["core/content.js"] });
          await new Promise(r => setTimeout(r, 150));
          await chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING" });
          setTimeout(() => window.close(), 100);
        } catch (injectionErr) {
          alert("Ops! Por favor faça um Refresh (F5) na página e tente gravar novamente.");
        }
      }
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("jam-btn-screenshot").addEventListener("click", () => startApp("screenshot"));
  document.getElementById("jam-btn-record").addEventListener("click", () => startApp("record"));
});
