// content.js — BugSnap Content Script
// Coleta informações da página e também instrumenta console/network no contexto real da página.

(function () {
  const MAX_CONSOLE_LOGS = 200;
  const MAX_NETWORK_REQUESTS = 100;
  const consoleLogs = [];
  const networkRequests = [];
  const SOURCE = "BUGSNAP_PAGE_EVENT";
  const CONTENT_FLAG = "__BUGSNAP_CONTENT_INJECTED__";
  listenToPageEvents();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_PAGE_INFO") {
      sendResponse(getPageInfo());
      return true;
    }

    if (msg.type === "GET_DEBUG_DATA") {
      sendResponse({
        consoleLogs: consoleLogs.slice(-MAX_CONSOLE_LOGS),
        networkRequests: networkRequests.slice(-MAX_NETWORK_REQUESTS),
      });
      return true;
    }

    if (msg.type === "CLEAR_DEBUG_DATA") {
      consoleLogs.length = 0;
      networkRequests.length = 0;
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "START_RECORDING") {
      startRecording();
      sendResponse({ ok: true });
      return true;
    }
  });

  // --- RECORDING IN-PAGE LOGIC ---
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let startTime = 0;
  let timerInterval = null;
  let isPaused = false;
  let toolbarEl = null;

  async function startRecording() {
    if (mediaRecorder) return;

    try {
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        alert("Aviso do BugSnap: O acesso ao microfone foi negado pelo seu navegador neste site. A gravação prosseguirá apenas com áudio do sistema (se houver).");
        console.warn("Sem acesso ao microfone", err);
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          frameRate: { ideal: 30, max: 30 }, 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        },
        audio: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include"
      });

      if (!displayStream) return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const destNode = audioContext.createMediaStreamDestination();
      let gotAudio = false;

      if (displayStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks())).connect(destNode);
        gotAudio = true;
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(micStream).connect(destNode);
        gotAudio = true;
      }

      const tracks = [...displayStream.getVideoTracks()];
      if (gotAudio) {
        tracks.push(...destNode.stream.getAudioTracks());
      }

      mediaStream = new MediaStream(tracks);
      mediaStream._displayStream = displayStream;
      mediaStream._micStream = micStream;

      mediaStream.getVideoTracks()[0].addEventListener("ended", stopRecording);

      const mimeType = "video/webm;codecs=vp9";
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        clearInterval(timerInterval);
        removeToolbar();
        const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,"-");
        
        // Embalar Video
        const videoBlob = new Blob(recordedChunks, { type: mimeType });
        downloadFile(videoBlob, `bugsnap-recording-${timestamp}.webm`);

        // Embalar Metadados e Logs (JSON)
        const payload = {
          pageInfo: getPageInfo(),
          consoleLogs,
          networkRequests
        };
        const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        downloadFile(jsonBlob, `bugsnap-session-${timestamp}.json`);

        mediaStream?.getTracks().forEach((t) => t.stop());
        mediaStream?._displayStream?.getTracks().forEach((t) => t.stop());
        mediaStream?._micStream?.getTracks().forEach((t) => t.stop());
        mediaStream = null;
        mediaRecorder = null;
        recordedChunks = [];
      };

      mediaRecorder.start(1000);
      let elapsedMs = 0;
      isPaused = false;
      injectToolbar();
      
      timerInterval = setInterval(() => {
        if (!isPaused && toolbarEl) {
          elapsedMs += 500;
          const secs = Math.floor(elapsedMs / 1000);
          const mins = Math.floor(secs / 60);
          const remain = String(secs % 60).padStart(2, "0");
          const timeStr = `${mins}:${remain}`;
          const timeNode = toolbarEl.querySelector(".bs-time");
          if (timeNode) timeNode.textContent = timeStr;
        }
      }, 500);

    } catch (err) {
      console.error("BugSnap Recording error:", err);
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }

  function injectToolbar() {
    if (document.getElementById("bugsnap-toolbar")) return;

    toolbarEl = document.createElement("div");
    toolbarEl.id = "bugsnap-toolbar";
    toolbarEl.innerHTML = `
      <style>
        #bugsnap-toolbar {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: #1c1c1e;
          border: 1px solid #3a3a3c;
          border-radius: 999px;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          z-index: 2147483647;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          font-family: -apple-system, sans-serif;
          color: white;
        }
        .bs-dot {
          width: 12px;
          height: 12px;
          background: #ff453a;
          border-radius: 50%;
          animation: bs-pulse 1.5s infinite;
        }
        @keyframes bs-pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 69, 58, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(255, 69, 58, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 69, 58, 0); }
        }
        .bs-text {
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .bs-time {
          font-variant-numeric: tabular-nums;
        }
        .bs-divider {
          width: 1px;
          height: 20px;
          background: #3a3a3c;
        }
        .bs-btn {
          background: none;
          border: none;
          color: #a1a1aa;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        .bs-btn:hover { color: white; }
        .bs-btn svg { width: 18px; height: 18px; fill: currentColor; }
        .bs-btn-stop svg { width: 16px; height: 16px; }
      </style>
      <div class="bs-dot"></div>
      <div class="bs-text">Gravando... <span class="bs-time">0:00</span></div>
      <div class="bs-divider"></div>
      <button class="bs-btn bs-btn-pause" title="Pausar/Continuar">
        <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      </button>
      <button class="bs-btn bs-btn-mic" title="Ligar/Desligar Microfone">
        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
      </button>
      <button class="bs-btn bs-btn-stop" title="Encerrar Gravação">
        <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
      </button>
    `;
    
    document.body.appendChild(toolbarEl);

    const pauseBtn = toolbarEl.querySelector(".bs-btn-pause");
    const sgvPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    const sgvPlay = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    
    pauseBtn.addEventListener("click", () => {
      if (!mediaRecorder) return;
      if (isPaused) {
        mediaRecorder.resume();
        toolbarEl.querySelector(".bs-dot").style.animationPlayState = "running";
        pauseBtn.innerHTML = sgvPause;
      } else {
        mediaRecorder.pause();
        toolbarEl.querySelector(".bs-dot").style.animationPlayState = "paused";
        pauseBtn.innerHTML = sgvPlay;
      }
      isPaused = !isPaused;
    });

    const micBtn = toolbarEl.querySelector(".bs-btn-mic");
    let micMuted = false;
    
    // Se nao temos mic base, deixe o botão cinza e desativado
    if (!mediaStream?._micStream || mediaStream._micStream.getAudioTracks().length === 0) {
      micBtn.style.color = "#3a3a3c";
      micBtn.title = "Sem microfone detectado";
    } else {
      micBtn.addEventListener("click", () => {
        micMuted = !micMuted;
        mediaStream._micStream.getAudioTracks().forEach(t => t.enabled = !micMuted);
        micBtn.style.color = micMuted ? "#ff453a" : "#a1a1aa";
      });
    }

    toolbarEl.querySelector(".bs-btn-stop").addEventListener("click", stopRecording);
  }

  function removeToolbar() {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
    }
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }

  function getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      readyState: document.readyState,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      timestamp: new Date().toISOString(),
      localTime: new Date().toLocaleString("pt-BR"),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      performance: getPerformanceInfo(),
    };
  }

  function getPerformanceInfo() {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return null;
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        loadTime: Math.round(nav.loadEventEnd - nav.startTime),
        ttfb: Math.round(nav.responseStart - nav.requestStart),
      };
    } catch {
      return null;
    }
  }

  function listenToPageEvents() {
    if (window[CONTENT_FLAG]) return;
    window[CONTENT_FLAG] = true;

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== SOURCE) return;

      const payload = event.data.payload;
      if (!payload) return;

      if (payload.kind === "console" && payload.entry) {
        consoleLogs.push(payload.entry);
        trimBuffer(consoleLogs, MAX_CONSOLE_LOGS);
      }

      if (payload.kind === "network" && payload.entry) {
        networkRequests.push(payload.entry);
        trimBuffer(networkRequests, MAX_NETWORK_REQUESTS);
      }
    });
  }

  function trimBuffer(list, max) {
    while (list.length > max) list.shift();
  }
})();
