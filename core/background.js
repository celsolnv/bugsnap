// background.js — BugSnap Service Worker
// Gerencia captura de logs, network e screenshot

const state = {
  attached: new Set(),
  consoleLogs: {},
  networkRequests: {},
  networkMeta: {},
};

// ─── Debugger: Attach/Detach ───────────────────────────────────────────────

function attachDebugger(tabId) {
  if (state.attached.has(tabId)) return;

  chrome.debugger.attach({ tabId }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.warn("Debugger attach error:", chrome.runtime.lastError.message);
      return;
    }
    state.attached.add(tabId);
    state.consoleLogs[tabId] = [];
    state.networkRequests[tabId] = [];
    state.networkMeta[tabId] = {};

    chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
    chrome.debugger.sendCommand({ tabId }, "Network.enable");
    chrome.debugger.sendCommand({ tabId }, "Log.enable");
  });
}

function detachDebugger(tabId) {
  if (!state.attached.has(tabId)) return;
  chrome.debugger.detach({ tabId }, () => {
    state.attached.delete(tabId);
  });
}

// ─── Debugger Events ──────────────────────────────────────────────────────

chrome.debugger.onEvent.addListener((source, method, params) => {
  const { tabId } = source;

  if (!state.consoleLogs[tabId]) state.consoleLogs[tabId] = [];
  if (!state.networkRequests[tabId]) state.networkRequests[tabId] = [];
  if (!state.networkMeta[tabId]) state.networkMeta[tabId] = {};

  // Console logs
  if (method === "Runtime.consoleAPICalled") {
    const entry = {
      type: params.type,
      timestamp: new Date().toISOString(),
      args: params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)),
    };
    state.consoleLogs[tabId].push(entry);
    // Manter apenas os últimos 200
    if (state.consoleLogs[tabId].length > 200) {
      state.consoleLogs[tabId].shift();
    }
  }

  // Exceções não capturadas
  if (method === "Runtime.exceptionThrown") {
    const ex = params.exceptionDetails;
    state.consoleLogs[tabId].push({
      type: "error",
      timestamp: new Date().toISOString(),
      args: [ex.text || "Uncaught exception", ex.url ? `(${ex.url}:${ex.lineNumber})` : ""],
    });
  }

  // Log entries (erros de rede etc.)
  if (method === "Log.entryAdded") {
    const entry = params.entry;
    if (entry.level === "error" || entry.level === "warning") {
      state.consoleLogs[tabId].push({
        type: entry.level,
        timestamp: new Date().toISOString(),
        args: [entry.text],
        source: entry.source,
        url: entry.url,
      });
    }
  }

  // Network requests
  if (method === "Network.requestWillBeSent") {
    state.networkMeta[tabId][params.requestId] = {
      url: params.request?.url,
      method: params.request?.method,
      initiator: params.initiator?.type || "network",
    };
  }

  if (method === "Network.responseReceived") {
    const { response, requestId } = params;
    const meta = state.networkMeta[tabId][requestId] || {};
    state.networkRequests[tabId].push({
      requestId,
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      method: meta.method || "GET",
      initiator: meta.initiator || "network",
      mimeType: response.mimeType,
      timestamp: new Date().toISOString(),
    });
    if (state.networkRequests[tabId].length > 100) {
      state.networkRequests[tabId].shift();
    }
  }

  // Network errors
  if (method === "Network.loadingFailed") {
    const meta = state.networkMeta[tabId][params.requestId] || {};
    state.networkRequests[tabId].push({
      requestId: params.requestId,
      url: meta.url || "(failed)",
      status: 0,
      statusText: params.errorText,
      method: meta.method || "GET",
      initiator: meta.initiator || "network",
      timestamp: new Date().toISOString(),
      failed: true,
    });
  }
});

// ─── Tab lifecycle ────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(({ tabId }) => {
  attachDebugger(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    if (!state.attached.has(tabId)) attachDebugger(tabId);
    // Limpar logs anteriores na navegação
    state.consoleLogs[tabId] = [];
    state.networkRequests[tabId] = [];
    state.networkMeta[tabId] = {};
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
  delete state.consoleLogs[tabId];
  delete state.networkRequests[tabId];
  delete state.networkMeta[tabId];
});

chrome.debugger.onDetach.addListener(({ tabId }) => {
  state.attached.delete(tabId);
});

// ─── Messages ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_LOGS") {
    const tabId = msg.tabId;
    sendResponse({
      consoleLogs: state.consoleLogs[tabId] ?? [],
      networkRequests: state.networkRequests[tabId] ?? [],
    });
    return true;
  }

  if (msg.type === "CAPTURE_SCREENSHOT") {
    const tabId = msg.tabId;
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // async
  }

  if (msg.type === "ATTACH_TAB") {
    attachDebugger(msg.tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "CLEAR_DEBUG_DATA") {
    const tabId = msg.tabId;
    state.consoleLogs[tabId] = [];
    state.networkRequests[tabId] = [];
    state.networkMeta[tabId] = {};
    sendResponse({ ok: true });
    return true;
  }
});
