const stage = document.querySelector("#stage");
const statusBadge = document.querySelector("#connectionStatus");
const ticker = document.querySelector("#ticker");
const tickerText = document.querySelector("#tickerText");

const POLL_INTERVAL_MS = 10000;
const FALLBACK_IMAGE_DURATION_MS = 10000;

const params = new URLSearchParams(window.location.search);
const queryTvId = params.get("tvId") || params.get("tv");
if (queryTvId) {
  localStorage.setItem("tv:id", queryTvId);
}

const tvId = queryTvId || localStorage.getItem("tv:id") || "";

let playlist = [];
let currentTicker = null;
let playlistSignature = "";
let currentIndex = 0;
let slideTimer = null;

function mediaSignature(items, tickerState) {
  const mediaPart = items.map((item) => `${item.id}:${item.url}:${item.durationSeconds}`).join("|");
  const tickerPart = tickerState ? `${tickerState.enabled}:${tickerState.text}:${tickerState.speedSeconds}:${tickerState.updatedAt}` : "";
  return `${mediaPart}::${tickerPart}`;
}

function clearSlideTimer() {
  if (slideTimer) {
    window.clearTimeout(slideTimer);
    slideTimer = null;
  }
}

function setStatus(online, tvName = "") {
  const label = tvName || tvId || "geral";
  statusBadge.textContent = online ? `online • ${label}` : `reconectando • ${label}`;
  statusBadge.classList.toggle("offline", !online);
}

function renderTicker(tickerState) {
  currentTicker = tickerState || { enabled: false, text: "" };
  const shouldShow = Boolean(currentTicker.enabled && currentTicker.text);

  ticker.hidden = !shouldShow;
  document.body.classList.toggle("has-ticker", shouldShow);

  if (shouldShow) {
    tickerText.textContent = currentTicker.text;
    ticker.style.setProperty("--ticker-duration", `${currentTicker.speedSeconds || 24}s`);
  } else {
    tickerText.textContent = "";
  }
}

function renderEmpty() {
  clearSlideTimer();
  stage.innerHTML = `
    <section class="tv-empty">
      <h1>InfoSesi TV</h1>
      <p>${tvId ? "Aguardando conteudo para esta TV." : "Abra esta pagina com /tv?tvId=ID_DA_TV para conteudos individuais."}</p>
    </section>
  `;
}

function showNextMedia() {
  if (!playlist.length) {
    renderEmpty();
    return;
  }

  clearSlideTimer();

  const media = playlist[currentIndex % playlist.length];
  const isVideo = media.type === "video";
  stage.innerHTML = isVideo
    ? `<video class="tv-media" src="${media.url}" autoplay muted loop playsinline></video>`
    : `<img class="tv-media" src="${media.url}" alt="">`;

  currentIndex = (currentIndex + 1) % playlist.length;

  if (!isVideo && playlist.length > 1) {
    slideTimer = window.setTimeout(showNextMedia, (media.durationSeconds || 10) * 1000);
  }

  if (isVideo && playlist.length > 1) {
    const video = stage.querySelector("video");
    slideTimer = window.setTimeout(showNextMedia, FALLBACK_IMAGE_DURATION_MS);
    video.addEventListener("loadedmetadata", () => {
      clearSlideTimer();
      const duration = Number.isFinite(video.duration) ? video.duration * 1000 : FALLBACK_IMAGE_DURATION_MS;
      slideTimer = window.setTimeout(showNextMedia, Math.max(duration, 3000));
    }, { once: true });
  }
}

function applyState(nextPlaylist, tickerState, tv) {
  const nextSignature = mediaSignature(nextPlaylist, tickerState);
  renderTicker(tickerState);
  setStatus(true, tv?.name);

  if (nextSignature !== playlistSignature) {
    playlist = nextPlaylist;
    playlistSignature = nextSignature;
    currentIndex = 0;
    showNextMedia();
    localStorage.setItem("tv:lastState", JSON.stringify({ playlist, ticker: tickerState }));
  }
}

async function fetchPlaylist() {
  try {
    const query = tvId ? `?tvId=${encodeURIComponent(tvId)}` : "";
    const response = await fetch(`/api/midia-atual${query}`, { cache: "no-store" });
    const data = await response.json();
    const nextPlaylist = Array.isArray(data.playlist) ? data.playlist : [];
    applyState(nextPlaylist, data.ticker, data.tv);
  } catch (error) {
    setStatus(false);
    const cached = localStorage.getItem("tv:lastState");
    if (!playlist.length && cached) {
      const parsed = JSON.parse(cached);
      playlist = Array.isArray(parsed.playlist) ? parsed.playlist : [];
      renderTicker(parsed.ticker);
      playlistSignature = mediaSignature(playlist, parsed.ticker);
      showNextMedia();
    }
  }
}

fetchPlaylist();
window.setInterval(fetchPlaylist, POLL_INTERVAL_MS);
