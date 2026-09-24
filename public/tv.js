const stage = document.querySelector("#stage");
const statusBadge = document.querySelector("#connectionStatus");
const ticker = document.querySelector("#ticker");
const tickerText = document.querySelector("#tickerText");
const params = new URLSearchParams(location.search);
const tvId = params.get("tvId") || params.get("tv") || "";
const cacheKey = `tv:v2:${tvId || "general"}`;
statusBadge.hidden = !params.has("diagnostic");
let state = { playlist: [], playback: { muted: true, volume: 50 }, ticker: {} };
let currentKey = null,
  currentMedia = null,
  slideTimer,
  startupTimer;
let started = false,
  starting = false,
  audioBlocked = false,
  lastError = "";
let dispose = () => {};
const key = (media) => media.entryId || media.id;
function status(online) {
  statusBadge.textContent = `${online ? "online" : "reconectando"} • ${state.tv?.name || tvId || "geral"}`;
  statusBadge.classList.toggle("offline", !online);
}
function report() {
  if (!tvId) return;
  fetch("/api/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tvId,
      mediaId: currentMedia?.id || "",
      audioBlocked,
      error: lastError,
    }),
  }).catch(() => {});
}
function updateTicker() {
  const t = state.ticker || {};
  const enabled = Boolean(t.enabled && t.text);
  ticker.hidden = !enabled;
  document.documentElement.style.setProperty(
    "--ticker-height",
    enabled ? `${t.height || 72}px` : "0px",
  );
  ticker.style.height = `${t.height || 72}px`;
  ticker.style.fontSize = `${t.fontSize || 32}px`;
  ticker.style.backgroundColor = t.backgroundColor || "#0f766e";
  ticker.style.color = t.color || "#ffffff";
  ticker.style.setProperty("--ticker-duration", `${t.speedSeconds || 24}s`);
  if (tickerText.textContent !== (t.text || ""))
    tickerText.textContent = t.text || "";
}
function applyAudio() {
  const video = stage.querySelector("video");
  if (!video) return;
  video.volume = Math.max(
    0,
    Math.min(1, Number(state.playback.volume ?? 50) / 100),
  );
  video.muted = state.playback.muted !== false || audioBlocked;
  if (video.paused) play(video);
}
async function play(video) {
  try {
    await video.play();
  } catch (error) {
    if (!video.isConnected) return;
    if (error.name === "NotAllowedError") {
      audioBlocked = true;
      video.muted = true;
      report();
      try {
        await video.play();
      } catch {
        fail("Reprodução bloqueada pelo navegador.");
      }
    } else if (error.name !== "AbortError")
      fail("Não foi possível reproduzir o vídeo.");
  }
}
function empty(text) {
  stage.replaceChildren();
  const section = document.createElement("section");
  section.className = "tv-empty";
  const title = document.createElement("h1");
  title.textContent = "InfoSesi TV";
  const p = document.createElement("p");
  p.textContent = text;
  section.append(title, p);
  stage.append(section);
}
function cleanup() {
  clearTimeout(slideTimer);
  dispose();
  dispose = () => {};
  const video = stage.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}
function fail(message) {
  lastError = message;
  report();
  cleanup();
  empty("Conteúdo indisponível. Tentando o próximo…");
  slideTimer = setTimeout(next, 5000);
}
function next() {
  const index = state.playlist.findIndex((m) => key(m) === currentKey);
  show(state.playlist[(index + 1) % state.playlist.length]);
}
function show(media) {
  cleanup();
  currentMedia = media || null;
  currentKey = media ? key(media) : null;
  if (!media) {
    empty("Aguardando conteúdo para esta TV.");
    report();
    return;
  }
  lastError = "";
  const isVideo = media.type === "video";
  const element = document.createElement(isVideo ? "video" : "img");
  element.className = "tv-media";
  let failureTimer = setTimeout(
    () => fail("Tempo esgotado ao carregar a mídia."),
    30000,
  );
  const onError = () => fail("Arquivo indisponível ou formato incompatível.");
  element.addEventListener("error", onError);
  const listeners = [];
  function listen(event, fn) {
    element.addEventListener(event, fn);
    listeners.push([event, fn]);
  }
  dispose = () => {
    clearTimeout(failureTimer);
    element.removeEventListener("error", onError);
    for (const [event, fn] of listeners) element.removeEventListener(event, fn);
  };
  if (isVideo) {
    element.playsInline = true;
    element.preload = "auto";
    listen("ended", next);
    listen("pause", () => {
      if (!element.ended && element.isConnected) play(element);
    });
    listen("playing", () => {
      clearTimeout(failureTimer);
    });
    listen("waiting", () => {
      clearTimeout(failureTimer);
      failureTimer = setTimeout(() => fail("Vídeo sem resposta."), 30000);
    });
    listen("stalled", () => {
      clearTimeout(failureTimer);
      failureTimer = setTimeout(
        () => fail("Falha no carregamento do vídeo."),
        30000,
      );
    });
  } else {
    element.alt = "";
    listen("load", () => {
      clearTimeout(failureTimer);
      slideTimer = setTimeout(
        next,
        Math.max(1, media.durationSeconds || 10) * 1000,
      );
    });
  }
  element.src = media.url;
  stage.replaceChildren(element);
  if (isVideo) applyAudio();
  report();
}
function begin() {
  if (started || starting) return;
  starting = true;
  const delay = state.playback.delayEnabled
    ? Number(state.playback.delaySeconds) || 0
    : 0;
  if (delay > 0) empty("A programação começa em instantes.");
  startupTimer = setTimeout(() => {
    started = true;
    starting = false;
    show(state.playlist[0]);
  }, delay * 1000);
}
function applyState(data) {
  const previousAudio = JSON.stringify(state.playback);
  state = {
    ...data,
    playlist: Array.isArray(data.playlist) ? data.playlist : [],
    playback: data.playback || { muted: true, volume: 50 },
  };
  updateTicker();
  if (JSON.stringify(state.playback) !== previousAudio) audioBlocked = false;
  applyAudio();
  if (!started) begin();
  else {
    const retained = state.playlist.find((m) => key(m) === currentKey);
    if (!retained || retained.url !== currentMedia?.url)
      show(state.playlist[0]);
    // Duration/order changes take effect on the next occurrence, without interrupting this item.
  }
  try {
    localStorage.setItem(cacheKey, JSON.stringify(state));
  } catch {
    /* Quota or disabled storage. */
  }
}
async function poll() {
  try {
    const response = await fetch(
      `/api/midia-atual?tvId=${encodeURIComponent(tvId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Servidor indisponível");
    applyState(await response.json());
    status(true);
    report();
  } catch {
    status(false);
    if (!starting && !started) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached && Array.isArray(cached.playlist)) applyState(cached);
        else empty("Conectando à programação…");
      } catch {
        empty("Conectando à programação…");
      }
    }
  } finally {
    setTimeout(poll, 10000);
  }
}
window.addEventListener("beforeunload", () => {
  cleanup();
  clearTimeout(startupTimer);
});
poll();
