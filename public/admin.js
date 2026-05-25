const form = document.querySelector("#uploadForm");
const mediaInput = document.querySelector("#mediaInput");
const durationInput = document.querySelector("#durationInput");
const submitButton = document.querySelector("#submitButton");
const message = document.querySelector("#message");
const mediaList = document.querySelector("#mediaList");
const refreshButton = document.querySelector("#refreshButton");

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`;
}

async function loadMidias() {
  const response = await fetch("/api/midias");
  const midias = await response.json();

  if (!midias.length) {
    mediaList.innerHTML = '<p class="empty-list">Nenhuma mídia cadastrada ainda.</p>';
    return;
  }

  mediaList.innerHTML = midias.map((media) => `
    <article class="media-card">
      <div class="thumb">
        ${media.type === "video"
          ? `<video src="${media.url}" muted></video>`
          : `<img src="${media.url}" alt="${media.originalName}">`}
      </div>
      <div class="media-info">
        <strong>${media.originalName}</strong>
        <span>${media.type === "video" ? "Video" : "Imagem"} • ${formatBytes(media.size)} • ${media.durationSeconds}s</span>
        <small>${new Date(media.createdAt).toLocaleString("pt-BR")}</small>
      </div>
      <button class="delete-button" data-id="${media.id}" type="button">Remover</button>
    </article>
  `).join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = mediaInput.files[0];

  if (!file) {
    setMessage("Escolha uma imagem ou video.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("media", file);
  formData.append("durationSeconds", durationInput.value);

  submitButton.disabled = true;
  setMessage("Enviando...", "");

  try {
    const response = await fetch("/api/midias", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Falha no envio.");

    form.reset();
    durationInput.value = 10;
    setMessage("Midia enviada. As TVs atualizarao automaticamente.", "success");
    await loadMidias();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

mediaList.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;

  button.disabled = true;
  await fetch(`/api/midias/${button.dataset.id}`, { method: "DELETE" });
  await loadMidias();
});

refreshButton.addEventListener("click", loadMidias);
loadMidias();
