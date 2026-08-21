const form = document.querySelector("#uploadForm");
const mediaInput = document.querySelector("#mediaInput");
const durationInput = document.querySelector("#durationInput");
const targetModeInput = document.querySelector("#targetModeInput");
const targetGroupPanel = document.querySelector("#targetGroupPanel");
const targetTvPanel = document.querySelector("#targetTvPanel");
const groupTargets = document.querySelector("#groupTargets");
const tvTargets = document.querySelector("#tvTargets");
const submitButton = document.querySelector("#submitButton");
const message = document.querySelector("#message");
const mediaList = document.querySelector("#mediaList");
const refreshButton = document.querySelector("#refreshButton");

const tvForm = document.querySelector("#tvForm");
const tvNameInput = document.querySelector("#tvNameInput");
const tvGroupInput = document.querySelector("#tvGroupInput");
const tvButton = document.querySelector("#tvButton");
const tvList = document.querySelector("#tvList");

const tickerForm = document.querySelector("#tickerForm");
const tickerEnabledInput = document.querySelector("#tickerEnabledInput");
const tickerTextInput = document.querySelector("#tickerTextInput");
const tickerSpeedInput = document.querySelector("#tickerSpeedInput");
const tickerButton = document.querySelector("#tickerButton");
const tickerMessage = document.querySelector("#tickerMessage");

let dashboard = {
  midias: [],
  tvs: [],
  groups: [],
  settings: { ticker: { enabled: false, text: "", speedSeconds: 24 } }
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`;
}

function getSelectedValues(container) {
  return [...container.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
}

function renderTargetControls() {
  groupTargets.innerHTML = dashboard.groups.length
    ? dashboard.groups.map((group) => `
      <label class="checkbox-card">
        <input type="checkbox" value="${escapeHtml(group)}">
        <span>${escapeHtml(group)}</span>
      </label>
    `).join("")
    : '<p class="empty-list">Cadastre uma TV para criar grupos.</p>';

  tvTargets.innerHTML = dashboard.tvs.length
    ? dashboard.tvs.map((tv) => `
      <label class="checkbox-card">
        <input type="checkbox" value="${escapeHtml(tv.id)}">
        <span>${escapeHtml(tv.name)}</span>
        <small>${escapeHtml(tv.group)}</small>
      </label>
    `).join("")
    : '<p class="empty-list">Nenhuma TV cadastrada.</p>';

  syncTargetPanels();
}

function syncTargetPanels() {
  targetGroupPanel.hidden = targetModeInput.value !== "groups";
  targetTvPanel.hidden = targetModeInput.value !== "tvs";
}

function targetSummary(media) {
  if (!media.targetMode || media.targetMode === "all") return "Todas as TVs";

  if (media.targetMode === "groups") {
    return `Grupos: ${(media.targetGroups || []).join(", ") || "nenhum"}`;
  }

  const names = (media.targetTvIds || []).map((id) => {
    const tv = dashboard.tvs.find((item) => item.id === id);
    return tv ? tv.name : id;
  });

  return `TVs: ${names.join(", ") || "nenhuma"}`;
}

function renderTvs() {
  if (!dashboard.tvs.length) {
    tvList.innerHTML = '<p class="empty-list">Nenhuma TV cadastrada.</p>';
    return;
  }

  tvList.innerHTML = dashboard.tvs.map((tv) => {
    const url = `/tv?tvId=${encodeURIComponent(tv.id)}`;
    return `
      <article class="tv-card">
        <div>
          <div class="tv-name-row">
            <span class="status-dot ${tv.online ? "online" : ""}"></span>
            <strong>${escapeHtml(tv.name)}</strong>
          </div>
          <span class="meta-line">${escapeHtml(tv.group)} • ID: ${escapeHtml(tv.id)}</span>
          <a href="${url}" target="_blank" rel="noreferrer">${url}</a>
        </div>
        <button class="delete-button" data-tv-id="${escapeHtml(tv.id)}" type="button">Remover</button>
      </article>
    `;
  }).join("");
}

function renderTickerForm() {
  const ticker = dashboard.settings.ticker || {};
  tickerEnabledInput.checked = Boolean(ticker.enabled);
  tickerTextInput.value = ticker.text || "";
  tickerSpeedInput.value = ticker.speedSeconds || 24;
}

function renderMidias() {
  if (!dashboard.midias.length) {
    mediaList.innerHTML = '<p class="empty-list">Nenhuma midia cadastrada ainda.</p>';
    return;
  }

  mediaList.innerHTML = dashboard.midias.map((media) => `
    <article class="media-card">
      <div class="thumb">
        ${media.type === "video"
          ? `<video src="${escapeHtml(media.url)}" muted></video>`
          : `<img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.originalName)}">`}
      </div>
      <div class="media-info">
        <strong>${escapeHtml(media.originalName)}</strong>
        <span>${media.type === "video" ? "Video" : "Imagem"} • ${formatBytes(media.size)} • ${media.durationSeconds}s</span>
        <small>${escapeHtml(targetSummary(media))}</small>
        <small>${new Date(media.createdAt).toLocaleString("pt-BR")}</small>
      </div>
      <button class="delete-button" data-media-id="${escapeHtml(media.id)}" type="button">Remover</button>
    </article>
  `).join("");
}

async function loadDashboard() {
  const [midiasResponse, configResponse] = await Promise.all([
    fetch("/api/midias"),
    fetch("/api/config")
  ]);

  dashboard.midias = await midiasResponse.json();
  const config = await configResponse.json();
  dashboard.tvs = config.tvs || [];
  dashboard.groups = config.groups || [];
  dashboard.settings = config.settings || dashboard.settings;

  renderTargetControls();
  renderTvs();
  renderTickerForm();
  renderMidias();
}

targetModeInput.addEventListener("change", syncTargetPanels);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = mediaInput.files[0];

  if (!file) {
    setMessage(message, "Escolha uma imagem ou video.", "error");
    return;
  }

  const targetMode = targetModeInput.value;
  const targetTvIds = getSelectedValues(tvTargets);
  const targetGroups = getSelectedValues(groupTargets);

  if (targetMode === "tvs" && !targetTvIds.length) {
    setMessage(message, "Escolha pelo menos uma TV.", "error");
    return;
  }

  if (targetMode === "groups" && !targetGroups.length) {
    setMessage(message, "Escolha pelo menos um grupo.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("media", file);
  formData.append("durationSeconds", durationInput.value);
  formData.append("targetMode", targetMode);
  formData.append("targetTvIds", JSON.stringify(targetTvIds));
  formData.append("targetGroups", JSON.stringify(targetGroups));

  submitButton.disabled = true;
  setMessage(message, "Enviando...", "");

  try {
    const response = await fetch("/api/midias", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Falha no envio.");

    form.reset();
    durationInput.value = 10;
    targetModeInput.value = "all";
    syncTargetPanels();
    setMessage(message, "Midia enviada. As TVs selecionadas atualizarao automaticamente.", "success");
    await loadDashboard();
  } catch (error) {
    setMessage(message, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

tvForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  tvButton.disabled = true;

  try {
    const response = await fetch("/api/tvs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tvNameInput.value,
        group: tvGroupInput.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Falha ao adicionar TV.");

    tvNameInput.value = "";
    tvGroupInput.value = result.group || "Geral";
    await loadDashboard();
  } finally {
    tvButton.disabled = false;
  }
});

tickerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  tickerButton.disabled = true;
  setMessage(tickerMessage, "Salvando...", "");

  try {
    const response = await fetch("/api/settings/ticker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: tickerEnabledInput.checked,
        text: tickerTextInput.value,
        speedSeconds: tickerSpeedInput.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Falha ao salvar faixa.");

    setMessage(tickerMessage, result.enabled ? "Faixa ativada nas TVs." : "Faixa desativada.", "success");
    await loadDashboard();
  } catch (error) {
    setMessage(tickerMessage, error.message, "error");
  } finally {
    tickerButton.disabled = false;
  }
});

mediaList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-media-id]");
  if (!button) return;

  button.disabled = true;
  await fetch(`/api/midias/${button.dataset.mediaId}`, { method: "DELETE" });
  await loadDashboard();
});

tvList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-tv-id]");
  if (!button) return;

  button.disabled = true;
  await fetch(`/api/tvs/${button.dataset.tvId}`, { method: "DELETE" });
  await loadDashboard();
});

refreshButton.addEventListener("click", loadDashboard);
loadDashboard();
