const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let data = {
  tvs: [],
  groups: [],
  midias: [],
  playlists: [],
  settings: { ticker: {}, groupPlaylists: {} },
};
let dirty = false,
  editPlaylist = null,
  selectedTv = null,
  dragged = null;
const defaults = {
  enabled: false,
  text: "",
  fontSize: 32,
  height: 72,
  speedSeconds: 24,
  color: "#ffffff",
  backgroundColor: "#0f766e",
};
function markDirty(value = true) {
  dirty = value;
  $("#dirtyNotice").hidden = !value;
}
function discard() {
  return !dirty || confirm("Descartar alterações ainda não salvas?");
}
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").className = error ? "error" : "success";
}
async function api(url, body, method = "POST") {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(result?.error || "Não foi possível concluir.");
  return result;
}
async function run(fn) {
  try {
    await fn();
  } catch (e) {
    notice(e.message, true);
  }
}
function options(value = null, label = "Herdar") {
  return (
    `<option value="">${label}</option>` +
    data.playlists
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === value ? "selected" : ""}>${esc(p.name)}</option>`,
      )
      .join("")
  );
}
function effective(tv) {
  const id =
    tv.playlistId ||
    data.settings.groupPlaylists?.[tv.group] ||
    data.settings.defaultPlaylistId;
  return (
    data.playlists.find((p) => p.id === id)?.name || "Distribuição original"
  );
}
function switchPage(page) {
  if (!discard()) return;
  if (page !== "playlists") {
    editPlaylist = null;
    $("#playlistEditor").hidden = true;
  }
  markDirty(false);
  document
    .querySelectorAll("[data-view]")
    .forEach((el) => (el.hidden = el.dataset.view !== page));
  document
    .querySelectorAll("[data-page]")
    .forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  $("#pageTitle").textContent = $(`[data-page="${page}"]`).textContent;
  location.hash = page;
  render();
}
async function load() {
  const [config, midias, playlists] = await Promise.all([
    api("/api/config"),
    api("/api/midias"),
    api("/api/playlists"),
  ]);
  data = { ...config, midias, playlists };
  render();
}
function render() {
  $("#stats").innerHTML = [
    ["TVs conectadas", data.tvs.filter((t) => t.online).length],
    ["TVs offline", data.tvs.filter((t) => !t.online).length],
    ["Mídias disponíveis", data.midias.length],
    ["Playlists", data.playlists.length],
  ]
    .map(
      ([name, value]) =>
        `<article class="stat"><span>${name}</span><strong>${value}</strong></article>`,
    )
    .join("");
  $("#overviewTvs").innerHTML =
    data.tvs
      .map(
        (tv) =>
          `<article class="tv-card"><div><strong>${esc(tv.name)}</strong><p class="meta-line">${esc(effective(tv))}</p></div><span class="badge ${tv.online ? "online" : ""}">${tv.online ? "Online" : "Offline"}</span></article>`,
      )
      .join("") || "<p>Nenhuma TV. Comece em TVs e grupos.</p>";
  renderTvs();
  renderMedia();
  renderPlaylists();
  renderTargets();
  renderAssignments();
  const scope = $("#tickerScope").value;
  $("#tickerScope").innerHTML =
    '<option value="">Configuração geral</option>' +
    data.tvs
      .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
      .join("");
  $("#tickerScope").value = data.tvs.some((t) => t.id === scope) ? scope : "";
  fillTicker();
  if (selectedTv) renderTvEditor(selectedTv);
}
function renderTvs() {
  const query = $("#tvSearch").value.toLowerCase();
  $("#tvList").innerHTML =
    data.tvs
      .filter((t) => (t.name + " " + t.group).toLowerCase().includes(query))
      .map(
        (t) =>
          `<article class="tv-card panel"><div><strong>${esc(t.name)}</strong><p class="meta-line">${esc(t.group)} · ${t.online ? "Online" : "Offline"}</p><p>Playlist: ${esc(effective(t))}</p><a href="/tv?tvId=${encodeURIComponent(t.id)}" target="_blank" rel="noreferrer">Abrir tela da TV</a></div><div class="actions"><button data-edit-tv="${esc(t.id)}">Configurar</button><button class="delete-button" data-delete-tv="${esc(t.id)}">Excluir</button></div></article>`,
      )
      .join("") || "<p>Nenhuma TV encontrada.</p>";
}
function renderTvEditor(id) {
  const tv = data.tvs.find((t) => t.id === id);
  if (!tv) {
    $("#tvEditor").hidden = true;
    return;
  }
  selectedTv = id;
  const p = tv.playback || {};
  const diag = tv.diagnostics;
  const file = data.midias.find((m) => m.id === diag?.mediaId);
  $("#tvEditor").hidden = false;
  $("#tvEditor").innerHTML =
    `<h2>${esc(tv.name)} · Reprodução</h2><form id="playbackForm" class="stack-form"><label>Playlist<select name="playlistId">${options(tv.playlistId)}</select></label><label>Volume: <output id="volumeValue">${p.volume ?? 50}</output>%<input name="volume" type="range" min="0" max="100" value="${p.volume ?? 50}"></label><label class="toggle-row"><input type="checkbox" name="muted" ${p.muted !== false ? "checked" : ""}>Silenciar áudio</label><label class="toggle-row"><input name="delayEnabled" type="checkbox" ${p.delayEnabled ? "checked" : ""}>Iniciar com atraso</label><label>Atraso inicial (segundos)<input type="number" name="delaySeconds" min="0" max="600" value="${p.delaySeconds || 0}" required></label><p class="meta-line">O atraso é aplicado uma vez ao abrir o player. O navegador pode exigir configuração para permitir áudio automático.</p><button>Salvar reprodução</button></form><hr><h3>Último diagnóstico recebido</h3><p>${diag ? `Conteúdo informado: ${esc(file?.originalName || "nenhum")}<br>Recebido: ${esc(new Date(diag.receivedAt).toLocaleString("pt-BR"))}<br>${diag.audioBlocked ? "Áudio bloqueado pelo navegador." : "Sem bloqueio de áudio informado."}<br>${esc(diag.error)}` : "Nenhum diagnóstico recebido nesta sessão do servidor."}</p><a href="/tv?tvId=${encodeURIComponent(id)}&diagnostic=1" target="_blank" rel="noreferrer">Abrir prévia com diagnóstico</a>`;
  $("#playbackForm").volume.addEventListener(
    "input",
    (e) => ($("#volumeValue").value = e.target.value),
  );
  $("#playbackForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      const f = e.target;
      await api(
        `/api/tvs/${encodeURIComponent(id)}`,
        {
          playlistId: f.playlistId.value || null,
          playback: {
            volume: Number(f.volume.value),
            muted: f.muted.checked,
            delayEnabled: f.delayEnabled.checked,
            delaySeconds: Number(f.delaySeconds.value),
          },
        },
        "PATCH",
      );
      markDirty(false);
      await load();
      notice("Reprodução salva. As TVs receberão a atualização.");
    });
  });
}
function renderTargets() {
  const mode = $("#targetMode").value;
  const values =
    mode === "groups"
      ? data.groups.map((g) => ({ id: g, name: g }))
      : mode === "tvs"
        ? data.tvs
        : [];
  $("#uploadTargets").innerHTML = values
    .map(
      (t) =>
        `<label class="checkbox-card"><input type="checkbox" value="${esc(t.id)}">${esc(t.name)}</label>`,
    )
    .join("");
}
function renderMedia() {
  const query = $("#mediaSearch").value.toLowerCase(),
    type = $("#mediaType").value;
  $("#mediaList").innerHTML =
    data.midias
      .filter(
        (m) =>
          m.originalName.toLowerCase().includes(query) &&
          (!type || m.type === type),
      )
      .map(
        (m) =>
          `<article class="media-card"><div class="thumb">${m.type === "video" ? `<video src="${esc(m.url)}" muted controls preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`}</div><div class="media-info"><strong>${esc(m.originalName)}</strong><span>${m.type === "video" ? "Vídeo" : "Imagem"} · ${(m.size / 1048576).toFixed(1)} MB</span><small>${m.targetMode === "library" ? "Somente biblioteca" : m.targetMode === "all" ? "Distribuição original: todas as TVs" : `Destinos: ${esc((m.targetGroups || []).concat(m.targetTvIds || []).join(", "))}`}</small></div><button class="delete-button" data-delete-media="${esc(m.id)}">Excluir arquivo</button></article>`,
      )
      .join("") ||
    "<p>Nenhuma mídia encontrada. Envie o primeiro arquivo acima.</p>";
}
function renderPlaylists() {
  $("#playlistList").innerHTML =
    data.playlists
      .map(
        (p) =>
          `<article class="panel"><h2>${esc(p.name)}</h2><p>${p.items.length} itens</p><div class="actions"><button data-edit-playlist="${esc(p.id)}">Editar</button><button class="secondary" data-copy-playlist="${esc(p.id)}">Duplicar</button><button class="delete-button" data-delete-playlist="${esc(p.id)}">Excluir</button></div></article>`,
      )
      .join("") ||
    "<p>Crie uma playlist para organizar a sequência de exibição.</p>";
}
function openPlaylist(id) {
  if (!discard()) return;
  editPlaylist = id
    ? structuredClone(data.playlists.find((p) => p.id === id))
    : { name: "Nova playlist", items: [] };
  markDirty(false);
  drawPlaylist();
}
function drawPlaylist() {
  const p = editPlaylist;
  $("#playlistEditor").hidden = false;
  $("#playlistEditor").innerHTML =
    `<h2>Editar sequência</h2><form id="playlistForm" class="stack-form"><label>Nome<input name="name" required maxlength="100" value="${esc(p.name)}"></label><div class="form-row"><label>Adicionar da biblioteca<select id="addMedia">${data.midias.map((m) => `<option value="${esc(m.id)}">${esc(m.originalName)}</option>`).join("")}</select></label><button type="button" id="addItem">Adicionar item</button></div><ol id="playlistItems">${p.items
      .map((item, index) => {
        const media = data.midias.find((m) => m.id === item.mediaId);
        return `<li draggable="true" data-index="${index}"><span class="item-name">${index + 1}. ${esc(media?.originalName || "Mídia removida")}</span>${media?.type === "image" ? `<label>Segundos<input data-duration="${index}" type="number" min="1" max="3600" value="${item.durationSeconds}" required></label>` : "<span>Até o final</span>"}<div class="actions"><button type="button" class="secondary" data-up="${index}" aria-label="Mover item ${index + 1} para cima" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="secondary" data-down="${index}" aria-label="Mover item ${index + 1} para baixo" ${index === p.items.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="delete-button" data-remove="${index}">Remover</button></div></li>`;
      })
      .join(
        "",
      )}</ol><p>${p.items.length} itens · Arraste para ordenar ou use as setas. Uma sequência vazia mostra a tela de espera.</p><button>Salvar playlist</button></form>`;
  $("#playlistForm").elements.name.oninput = (e) => {
    p.name = e.target.value;
  };
  $("#addItem").onclick = () => {
    const media = data.midias.find((m) => m.id === $("#addMedia").value);
    if (!media) return;
    p.items.push({
      id: crypto.randomUUID(),
      mediaId: media.id,
      durationSeconds: media.durationSeconds || 10,
    });
    markDirty();
    drawPlaylist();
  };
  $("#playlistItems").oninput = (e) => {
    if (e.target.dataset.duration !== undefined)
      p.items[Number(e.target.dataset.duration)].durationSeconds = Number(
        e.target.value,
      );
  };
  $("#playlistItems").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const [action, delta] of [
      ["up", -1],
      ["down", 1],
      ["remove", 0],
    ])
      if (b.dataset[action] !== undefined) {
        const i = Number(b.dataset[action]);
        if (action === "remove") p.items.splice(i, 1);
        else
          [p.items[i], p.items[i + delta]] = [p.items[i + delta], p.items[i]];
        markDirty();
        drawPlaylist();
      }
  };
  $("#playlistItems").ondragstart = (e) => {
    dragged = Number(e.target.closest("li")?.dataset.index);
  };
  $("#playlistItems").ondragover = (e) => e.preventDefault();
  $("#playlistItems").ondrop = (e) => {
    e.preventDefault();
    const row = e.target.closest("li");
    if (!row || !Number.isInteger(dragged)) return;
    const [item] = p.items.splice(dragged, 1);
    p.items.splice(Number(row.dataset.index), 0, item);
    dragged = null;
    markDirty();
    drawPlaylist();
  };
  $("#playlistForm").onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      editPlaylist = await api(
        p.id ? `/api/playlists/${p.id}` : "/api/playlists",
        { name: p.name, items: p.items },
        p.id ? "PUT" : "POST",
      );
      markDirty(false);
      await load();
      drawPlaylist();
      notice("Playlist salva.");
    });
  };
}
function renderAssignments() {
  $("#assignments").innerHTML =
    `<label>Playlist geral<select id="defaultPlaylist">${options(data.settings.defaultPlaylistId, "Distribuição original")}</select></label>` +
    data.groups
      .map(
        (group, index) =>
          `<label>${esc(group)}<select data-group-index="${index}">${options(data.settings.groupPlaylists?.[group])}</select></label>`,
      )
      .join("");
}
function fillTicker() {
  const id = $("#tickerScope").value,
    tv = data.tvs.find((t) => t.id === id);
  $("#inheritRow").hidden = !id;
  $("#tickerInherit").checked = Boolean(id && !tv?.ticker);
  const value = tv?.ticker || data.settings.ticker;
  for (const [key, fallback] of Object.entries(defaults)) {
    const el = $("#tickerForm").elements[key];
    if (el.type === "checkbox") el.checked = value[key] ?? fallback;
    else el.value = value[key] ?? fallback;
  }
  $("#tickerFields").disabled = $("#tickerInherit").checked;
  previewTicker();
}
function tickerValue() {
  const f = $("#tickerForm");
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      f.elements[key].type === "checkbox"
        ? f.elements[key].checked
        : f.elements[key].type === "number"
          ? Number(f.elements[key].value)
          : f.elements[key].value,
    ]),
  );
}
function previewTicker() {
  const t = tickerValue(),
    preview = $("#tickerPreview");
  preview.style.height = `${t.height}px`;
  preview.style.fontSize = `${t.fontSize}px`;
  preview.style.color = t.color;
  preview.style.backgroundColor = t.backgroundColor;
  preview.firstElementChild.textContent = t.enabled
    ? t.text || "Sua mensagem aqui"
    : "Faixa desativada";
  for (const el of document.querySelectorAll("[data-color]"))
    if (/^#[a-f0-9]{6}$/i.test(t[el.dataset.color]))
      el.value = t[el.dataset.color];
}
document
  .querySelectorAll("[data-page]")
  .forEach((b) => (b.onclick = () => switchPage(b.dataset.page)));
document.addEventListener("input", (e) => {
  if (e.target.closest("form")) markDirty();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
$("#refresh").onclick = () => {
  if (discard()) {
    markDirty(false);
    run(load);
  }
};
$("#tvSearch").oninput = renderTvs;
$("#mediaSearch").oninput = renderMedia;
$("#mediaType").onchange = renderMedia;
$("#targetMode").onchange = renderTargets;
$("#tvForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const f = e.target;
    await api("/api/tvs", {
      name: f.elements.name.value,
      group: f.elements.group.value,
    });
    f.reset();
    markDirty(false);
    await load();
    notice("TV cadastrada.");
  });
};
$("#uploadForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target,
    form = new FormData(f),
    mode = f.targetMode.value;
  const ids = [...$("#uploadTargets").querySelectorAll("input:checked")].map(
    (el) => el.value,
  );
  if (["groups", "tvs"].includes(mode) && !ids.length) {
    notice("Escolha pelo menos um destino.", true);
    return;
  }
  form.set("targetTvIds", JSON.stringify(mode === "tvs" ? ids : []));
  form.set("targetGroups", JSON.stringify(mode === "groups" ? ids : []));
  const button = f.querySelector("button");
  button.disabled = true;
  const progress = $("#uploadProgress");
  progress.hidden = false;
  progress.value = 0;
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/midias");
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) progress.value = (e.loaded / e.total) * 100;
  };
  xhr.onerror = () => {
    notice("Falha de rede no upload.", true);
    button.disabled = false;
  };
  xhr.onload = () => {
    button.disabled = false;
    run(async () => {
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        throw new Error("Resposta inválida durante o upload.");
      }
      if (xhr.status >= 400) throw new Error(result.error || "Erro no upload.");
      f.reset();
      markDirty(false);
      await load();
      notice(
        "Arquivo enviado. Adicione-o a uma playlist ou use a distribuição original.",
      );
    });
  };
  xhr.send(form);
};
$("#tvList").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.editTv) {
    if (discard()) {
      markDirty(false);
      renderTvEditor(b.dataset.editTv);
      $("#tvEditor").scrollIntoView({ behavior: "smooth" });
    }
  }
  if (
    b.dataset.deleteTv &&
    confirm(
      "Excluir esta TV? Seu link deixará de representar um dispositivo cadastrado.",
    )
  )
    run(async () => {
      await api(
        `/api/tvs/${encodeURIComponent(b.dataset.deleteTv)}`,
        {},
        "DELETE",
      );
      await load();
      notice("TV excluída.");
    });
};
$("#mediaList").onclick = (e) => {
  const b = e.target.closest("[data-delete-media]");
  if (!b) return;
  const id = b.dataset.deleteMedia;
  const refs = data.playlists.filter((p) =>
    p.items.some((i) => i.mediaId === id),
  );
  if (refs.length) {
    notice(
      `Remova o arquivo destas playlists antes de excluir: ${refs.map((p) => p.name).join(", ")}`,
      true,
    );
    return;
  }
  if (
    confirm(
      "Excluir permanentemente o arquivo e removê-lo da distribuição original?",
    )
  )
    run(async () => {
      await api(`/api/midias/${id}`, {}, "DELETE");
      await load();
      notice("Arquivo excluído.");
    });
};
$("#newPlaylist").onclick = () => openPlaylist();
$("#playlistList").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.editPlaylist) openPlaylist(b.dataset.editPlaylist);
  if (b.dataset.copyPlaylist)
    run(async () => {
      const p = data.playlists.find((p) => p.id === b.dataset.copyPlaylist);
      await api("/api/playlists", {
        name: p.name + " (cópia)",
        items: p.items.map((i) => ({ ...i, id: crypto.randomUUID() })),
      });
      await load();
      notice("Playlist duplicada.");
    });
  if (
    b.dataset.deletePlaylist &&
    confirm("Excluir esta playlist? Os arquivos serão mantidos.")
  )
    run(async () => {
      await api(`/api/playlists/${b.dataset.deletePlaylist}`, {}, "DELETE");
      if (editPlaylist?.id === b.dataset.deletePlaylist) {
        editPlaylist = null;
        $("#playlistEditor").hidden = true;
      }
      await load();
      notice("Playlist excluída.");
    });
};
$("#assignmentForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const groupPlaylists = {};
    document
      .querySelectorAll("[data-group-index]")
      .forEach((el) =>
        Object.defineProperty(
          groupPlaylists,
          data.groups[Number(el.dataset.groupIndex)],
          { value: el.value || null, enumerable: true },
        ),
      );
    await api("/api/settings/playlists", {
      defaultPlaylistId: $("#defaultPlaylist").value || null,
      groupPlaylists,
    });
    markDirty(false);
    await load();
    notice("Distribuição salva.");
  });
};
let previousScope = "";
$("#tickerScope").onchange = () => {
  if (!discard()) {
    $("#tickerScope").value = previousScope;
    return;
  }
  previousScope = $("#tickerScope").value;
  markDirty(false);
  fillTicker();
};
$("#tickerInherit").onchange = (e) => {
  $("#tickerFields").disabled = e.target.checked;
  markDirty();
};
$("#tickerForm").oninput = (e) => {
  if (e.target.dataset.color)
    $("#tickerForm").elements[e.target.dataset.color].value = e.target.value;
  previewTicker();
};
$("#tickerReset").onclick = () => {
  for (const [key, value] of Object.entries(defaults)) {
    const el = $("#tickerForm").elements[key];
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
  }
  markDirty();
  previewTicker();
};
$("#tickerForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const value = tickerValue();
    if (!$("#tickerInherit").checked && value.height < value.fontSize * 1.2 + 8)
      throw new Error("Aumente a altura da faixa para acomodar a fonte.");
    const id = $("#tickerScope").value;
    if (id)
      await api(
        `/api/tvs/${encodeURIComponent(id)}`,
        { ticker: $("#tickerInherit").checked ? null : value },
        "PATCH",
      );
    else await api("/api/settings/ticker", value);
    markDirty(false);
    await load();
    notice("Faixa salva. A reprodução continuará sem reiniciar.");
  });
};
run(async () => {
  await load();
  const page = location.hash.slice(1);
  if (
    ["overview", "tvs", "media", "playlists", "ticker", "settings"].includes(
      page,
    )
  )
    switchPage(page);
});
// Refresh only when it cannot overwrite a form being edited.
setInterval(() => {
  if (!dirty && !document.activeElement?.closest("form") && !editPlaylist)
    run(load);
}, 15000);
