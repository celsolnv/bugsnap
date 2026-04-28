export function getSystemInfo() {
  const systemInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory ? `${navigator.deviceMemory}GB` : "N/A",
    connection: navigator.connection
      ? `${navigator.connection.effectiveType} (↓${navigator.connection.downlink}Mbps)`
      : "N/A",
    cookiesEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Edg/")) browser = "Microsoft Edge";
  else if (ua.includes("Chrome/")) browser = "Google Chrome";
  else if (ua.includes("Firefox/")) browser = "Mozilla Firefox";
  else if (ua.includes("Safari/")) browser = "Apple Safari";
  const browserVersion = ua.match(/(Chrome|Firefox|Safari|Edg)\/(\d+)/)?.[2] ?? "?";
  systemInfo.browser = `${browser} ${browserVersion}`;

  return systemInfo;
}

export async function getPageInfo(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_INFO" });
  } catch {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { url: tab?.url, title: tab?.title, error: "content script unavailable" };
  }
}

export async function collectBugReport() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const systemInfo = getSystemInfo();
  const pageInfo = await getPageInfo(tab.id);

  const mergedDebugData = await getMergedDebugData(tab.id);
  const screenshotResp = await chrome.runtime.sendMessage({
    type: "CAPTURE_SCREENSHOT",
    tabId: tab.id,
  });

  return {
    tabId: tab.id,
    screenshot: screenshotResp?.dataUrl ?? null,
    data: {
      meta: {
        reportedAt: new Date().toISOString(),
        reportedAtLocal: new Date().toLocaleString("pt-BR"),
        bugSnapVersion: "1.0.0",
      },
      page: pageInfo,
      system: systemInfo,
      consoleLogs: mergedDebugData.consoleLogs,
      networkRequests: mergedDebugData.networkRequests,
      debugDiagnostics: mergedDebugData.debugDiagnostics,
      hasScreenshot: !!screenshotResp?.dataUrl,
    },
  };
}

export async function getMergedDebugData(tabId) {
  let pageDebugData = { consoleLogs: [], networkRequests: [] };
  try {
    pageDebugData = await chrome.tabs.sendMessage(tabId, { type: "GET_DEBUG_DATA" });
  } catch {}

  const mainWorldDebugData = await getMainWorldDebugData(tabId);
  const debuggerData = await chrome.runtime.sendMessage({ type: "GET_LOGS", tabId });

  const consoleLogs = mergeEntries(
    mainWorldDebugData.consoleLogs ?? [],
    pageDebugData.consoleLogs ?? [],
    debuggerData?.consoleLogs ?? [],
    (entry) => `${entry.type}|${(entry.args || []).join(" ")}|${entry.timestamp || ""}`
  );

  const networkRequests = mergeEntries(
    mainWorldDebugData.networkRequests ?? [],
    pageDebugData.networkRequests ?? [],
    debuggerData?.networkRequests ?? [],
    (entry) => `${entry.method || ""}|${entry.status}|${entry.url}|${entry.timestamp || ""}`
  );

  return {
    consoleLogs,
    networkRequests,
    debugDiagnostics: {
      bridgeConsoleCount: pageDebugData.consoleLogs?.length ?? 0,
      bridgeNetworkCount: pageDebugData.networkRequests?.length ?? 0,
      mainWorldConsoleCount: mainWorldDebugData.consoleLogs?.length ?? 0,
      mainWorldNetworkCount: mainWorldDebugData.networkRequests?.length ?? 0,
      mainWorldVersion: mainWorldDebugData.diagnostics?.version ?? null,
      mainWorldBootedAt: mainWorldDebugData.diagnostics?.bootedAt ?? null,
      debuggerConsoleCount: debuggerData?.consoleLogs?.length ?? 0,
      debuggerNetworkCount: debuggerData?.networkRequests?.length ?? 0,
    },
  };
}

export async function clearDebugData(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CLEAR_DEBUG_DATA" });
  } catch {}

  try {
    await chrome.runtime.sendMessage({ type: "CLEAR_DEBUG_DATA", tabId });
  } catch {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const store = window.__BUGSNAP_DEBUG_STORE__;
        if (store) {
          store.consoleLogs = [];
          store.networkRequests = [];
        }
      },
    });
  } catch {}
}

function mergeEntries(...args) {
  const getKey = args.pop();
  const sources = args;
  const merged = [];
  const seen = new Set();

  sources.forEach((source) => {
    (source || []).forEach((entry) => {
      if (!entry) return;
      const key = getKey(entry);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(entry);
    });
  });

  return merged;
}

async function getMainWorldDebugData(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const store = window.__BUGSNAP_DEBUG_STORE__;
        return {
          consoleLogs: store?.consoleLogs ?? [],
          networkRequests: store?.networkRequests ?? [],
          diagnostics: {
            version: store?.version ?? null,
            bootedAt: store?.bootedAt ?? null,
          },
        };
      },
    });

    return result?.result ?? { consoleLogs: [], networkRequests: [], diagnostics: {} };
  } catch {
    return { consoleLogs: [], networkRequests: [], diagnostics: {} };
  }
}
