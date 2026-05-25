const stage = document.querySelector("#stage");
const statusBadge = document.querySelector("#connectionStatus");

const POLL_INTERVAL_MS = 10000;
const FALLBACK_IMAGE_DURATION_MS = 10000;

let playlist = [];
let playlistSignature = "";
let currentIndex = 0;
let slideTimer = null;

function mediaSignature(items) {
  return items.map((item) => `${item.id}:${item.url}:${item.durationSeconds}`).join("|");
}

function clearSlideTimer() {
  if (slideTimer) {
    window.clearTimeout(slideTimer);
    slideTimer = null;
  }
}

function setStatus(online) {
  statusBadge.textContent = online ? "online" : "reconectando";
  statusBadge.classList.toggle("offline", !online);
}

function renderEmpty() {
  clearSlideTimer();
  stage.innerHTML = `
    <section class="tv-empty">
      <h1>TV pronta</h1>
      <p>Aguardando envio de mídia pelo painel administrativo.</p>
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
    video.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(video.duration) ? video.duration * 1000 : FALLBACK_IMAGE_DURATION_MS;
      slideTimer = window.setTimeout(showNextMedia, Math.max(duration, 3000));
    }, { once: true });
  }
}

async function fetchPlaylist() {
  try {
    const response = await fetch("/api/midia-atual", { cache: "no-store" });
    const data = await response.json();
    const nextPlaylist = Array.isArray(data.playlist) ? data.playlist : [];
    const nextSignature = mediaSignature(nextPlaylist);

    setStatus(true);

    if (nextSignature !== playlistSignature) {
      playlist = nextPlaylist;
      playlistSignature = nextSignature;
      currentIndex = 0;
      showNextMedia();
      localStorage.setItem("tv:lastPlaylist", JSON.stringify(playlist));
    }
  } catch (error) {
    setStatus(false);
    const cached = localStorage.getItem("tv:lastPlaylist");
    if (!playlist.length && cached) {
      playlist = JSON.parse(cached);
      playlistSignature = mediaSignature(playlist);
      showNextMedia();
    }
  }
}

fetchPlaylist();
window.setInterval(fetchPlaylist, POLL_INTERVAL_MS);
