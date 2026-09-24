import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  normalizeTicker,
  normalizePlayback,
  resolvePlaylist,
} from "./lib/config.js";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(ROOT, "uploads"),
);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const MEDIA_DB_FILE = path.join(DATA_DIR, "midias.json");
const TV_DB_FILE = path.join(DATA_DIR, "tvs.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const PLAYLIST_FILE = path.join(DATA_DIR, "playlists.json");
const diagnostics = new Map();
const ONLINE_WINDOW_MS = 45 * 1000;
const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".mp4",
  ".webm",
]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".webm"]);

const defaultTvs = [
  {
    id: "recepcao",
    name: "Recepcao",
    group: "Geral",
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
  },
  {
    id: "corredor",
    name: "Corredor",
    group: "Geral",
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
  },
  {
    id: "sala-professores",
    name: "Sala dos professores",
    group: "Equipe",
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
  },
];

const defaultSettings = {
  schemaVersion: 2,
  ticker: normalizeTicker({}),
  defaultPlaylistId: null,
  groupPlaylists: {},
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Erro ao ler ${path.basename(file)}:`, error);
    throw new Error(
      `Dados inválidos em ${file}; restaure um backup antes de iniciar.`,
    );
  }
}

function writeJson(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, file);
}

function ensureJson(file, fallback) {
  if (!fs.existsSync(file)) {
    writeJson(file, fallback);
  }
}

ensureJson(MEDIA_DB_FILE, []);
ensureJson(TV_DB_FILE, defaultTvs);
ensureJson(SETTINGS_FILE, defaultSettings);
// Upgrade once, preserving legacy targeting and a complete JSON snapshot.
const previousSettings = readJson(SETTINGS_FILE, defaultSettings);
if (previousSettings.schemaVersion !== 2) {
  const backup = path.join(DATA_DIR, `backup-v1-${Date.now()}`);
  fs.mkdirSync(backup);
  for (const file of [MEDIA_DB_FILE, TV_DB_FILE, SETTINGS_FILE]) {
    fs.copyFileSync(file, path.join(backup, path.basename(file)));
  }
  writeJson(SETTINGS_FILE, {
    ...defaultSettings,
    ...previousSettings,
    schemaVersion: 2,
    ticker: normalizeTicker(previousSettings.ticker || {}),
  });
}
ensureJson(PLAYLIST_FILE, []);
// Fail closed on corrupted persisted state, rather than silently overwriting it.
for (const file of [MEDIA_DB_FILE, TV_DB_FILE, PLAYLIST_FILE]) {
  if (!Array.isArray(readJson(file, [])))
    throw new Error(`Lista inválida: ${file}`);
}

function readMidias() {
  return readJson(MEDIA_DB_FILE, []);
}

function writeMidias(midias) {
  writeJson(MEDIA_DB_FILE, midias);
}

function readTvs() {
  return readJson(TV_DB_FILE, defaultTvs);
}

function writeTvs(tvs) {
  writeJson(TV_DB_FILE, tvs);
}

function readSettings() {
  const saved = readJson(SETTINGS_FILE, defaultSettings);
  return {
    ...defaultSettings,
    ...saved,
    ticker: normalizeTicker(saved.ticker || {}),
  };
}

function writeSettings(settings) {
  writeJson(SETTINGS_FILE, settings);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function makeUniqueId(base, existingIds) {
  const cleanBase = slugify(base) || "tv";
  let nextId = cleanBase;
  let count = 2;

  while (existingIds.has(nextId)) {
    nextId = `${cleanBase}-${count}`;
    count += 1;
  }

  return nextId;
}

function parseJsonArray(value) {
  if (!value) return [];
  const text = String(value).trim();

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch (_error) {
    return text
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
}

function getMediaType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  return "unknown";
}

function getGroups(tvs) {
  return [...new Set(tvs.map((tv) => tv.group).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function decorateTv(tv) {
  const lastSeenAt = tv.lastSeenAt ? Date.parse(tv.lastSeenAt) : 0;
  const online = Boolean(
    lastSeenAt && Date.now() - lastSeenAt <= ONLINE_WINDOW_MS,
  );
  return {
    ...tv,
    online,
    playback: normalizePlayback(tv.playback || {}),
    diagnostics: diagnostics.get(tv.id) || null,
  };
}

function updateHeartbeat(tvId) {
  if (!tvId) return null;

  const tvs = readTvs();
  const index = tvs.findIndex((tv) => tv.id === tvId);
  if (index === -1) return null;

  tvs[index] = { ...tvs[index], lastSeenAt: new Date().toISOString() };
  writeTvs(tvs);
  return tvs[index];
}

function isMediaForTv(media, tv, tvId) {
  const targetMode = media.targetMode || "all";
  const targetTvIds = Array.isArray(media.targetTvIds) ? media.targetTvIds : [];
  const targetGroups = Array.isArray(media.targetGroups)
    ? media.targetGroups
    : [];

  if (targetMode === "library") return false;
  if (targetMode === "all") return true;
  if (targetMode === "tvs") return Boolean(tvId && targetTvIds.includes(tvId));
  if (targetMode === "groups")
    return Boolean(tv?.group && targetGroups.includes(tv.group));
  return true;
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const baseName = slugify(path.basename(file.originalname, extension));
    callback(null, `${randomUUID()}-${baseName || "midia"}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return callback(
        new Error("Formato nao permitido. Use jpg, png, webp, mp4 ou webm."),
      );
    }
    callback(null, true);
  },
});

app.use(express.json({ limit: "1mb" }));
// Browser-native login. Configure both values on Render before deploying.
const adminUser = process.env.ADMIN_USER;
const adminPassword = process.env.ADMIN_PASSWORD;
if (Boolean(adminUser) !== Boolean(adminPassword))
  throw new Error("Configure ADMIN_USER e ADMIN_PASSWORD juntos.");
if (process.env.NODE_ENV === "production" && !adminPassword)
  throw new Error("Produção exige ADMIN_USER e ADMIN_PASSWORD.");
function equal(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
app.use((req, res, next) => {
  const publicApi = req.method === "GET" && req.path === "/api/midia-atual";
  const heartbeat = req.method === "POST" && req.path === "/api/heartbeat";
  const protectedRoute =
    req.path.startsWith("/admin") ||
    (req.path.startsWith("/api/") && !publicApi && !heartbeat);
  if (!protectedRoute || !adminPassword) return next();
  res.setHeader("Cache-Control", "no-store");
  const credentials = Buffer.from(
    (req.headers.authorization || "").replace(/^Basic /i, ""),
    "base64",
  ).toString();
  if (equal(credentials, `${adminUser}:${adminPassword}`)) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="InfoSesi", charset="UTF-8"');
  res.status(401).send("Autenticação necessária.");
});
app.use((req, res, next) => {
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.headers.origin
  ) {
    try {
      if (new URL(req.headers.origin).host !== req.get("host"))
        return res.status(403).json({ error: "Origem não permitida." });
    } catch {
      return res.status(403).end();
    }
  }
  next();
});
app.get("/healthz", (_req, res) =>
  res.json({ status: "ok", version: "2.0.0" }),
);
app.use(express.static(PUBLIC_DIR));
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }),
);

app.get("/", (_req, res) => {
  res.redirect("/admin");
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/tv", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "tv.html"));
});

app.get("/api/config", (_req, res) => {
  const tvs = readTvs().map(decorateTv);
  res.json({
    tvs,
    groups: getGroups(tvs),
    settings: readSettings(),
  });
});

app.get("/api/tvs", (_req, res) => {
  res.json(readTvs().map(decorateTv));
});

app.post("/api/tvs", (req, res) => {
  const name = String(req.body.name || "").trim();
  const group = String(req.body.group || "Geral").trim() || "Geral";

  if (!name) {
    return res.status(400).json({ error: "Informe o nome da TV." });
  }

  const tvs = readTvs();
  const tv = {
    id: makeUniqueId(req.body.id || name, new Set(tvs.map((item) => item.id))),
    name,
    group,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
  };

  tvs.push(tv);
  writeTvs(tvs);

  res.status(201).json(decorateTv(tv));
});

app.delete("/api/tvs/:id", (req, res) => {
  const tvs = readTvs();
  const exists = tvs.some((tv) => tv.id === req.params.id);

  if (!exists) {
    return res.status(404).json({ error: "TV nao encontrada." });
  }

  writeTvs(tvs.filter((tv) => tv.id !== req.params.id));

  const midias = readMidias().map((media) => ({
    ...media,
    targetTvIds: Array.isArray(media.targetTvIds)
      ? media.targetTvIds.filter((id) => id !== req.params.id)
      : [],
  }));
  writeMidias(midias);

  res.status(204).end();
});

app.post("/api/settings/ticker", (req, res) => {
  const settings = readSettings();
  settings.ticker = {
    ...normalizeTicker(req.body),
    updatedAt: new Date().toISOString(),
  };

  writeSettings(settings);
  res.json(settings.ticker);
});

app.get("/api/midias", (_req, res) => {
  res.json(readMidias());
});

app.get("/api/midia-atual", (req, res) => {
  const tvId = String(req.query.tvId || req.query.tv || "").trim();
  const heartbeatTv = updateHeartbeat(tvId);
  const tv = heartbeatTv || readTvs().find((item) => item.id === tvId) || null;
  const settings = readSettings();
  const legacy = readMidias().filter((media) => isMediaForTv(media, tv, tvId));
  const resolved = resolvePlaylist(
    tv,
    settings,
    readJson(PLAYLIST_FILE, []),
    readMidias(),
    legacy,
  );
  const playlist = resolved.items;

  res.json({
    updatedAt: playlist[0]?.createdAt || null,
    current: playlist[0] || null,
    playlist,
    ticker: tv?.ticker ? normalizeTicker(tv.ticker) : settings.ticker,
    playback: normalizePlayback(tv?.playback || {}),
    playlistSource: resolved.source,
    tv: tv ? decorateTv(tv) : null,
  });
});

app.post("/api/midias", upload.single("media"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Envie um arquivo no campo media." });
  }

  const tvs = readTvs();
  const groups = getGroups(tvs);
  const durationSeconds = Number.parseInt(req.body.durationSeconds, 10);
  const targetMode = ["all", "groups", "tvs", "library"].includes(
    req.body.targetMode,
  )
    ? req.body.targetMode
    : "all";
  const targetTvIds = parseJsonArray(req.body.targetTvIds).filter((id) =>
    tvs.some((tv) => tv.id === id),
  );
  const targetGroups = parseJsonArray(req.body.targetGroups).filter((group) =>
    groups.includes(group),
  );

  if (targetMode === "tvs" && !targetTvIds.length) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), { force: true }, () => {});
    return res
      .status(400)
      .json({ error: "Escolha pelo menos uma TV para este conteudo." });
  }

  if (targetMode === "groups" && !targetGroups.length) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), { force: true }, () => {});
    return res
      .status(400)
      .json({ error: "Escolha pelo menos um grupo para este conteudo." });
  }

  const media = {
    id: randomUUID(),
    originalName: req.file.originalname,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    type: getMediaType(req.file.filename),
    durationSeconds:
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 10,
    size: req.file.size,
    targetMode,
    targetTvIds: targetMode === "tvs" ? targetTvIds : [],
    targetGroups: targetMode === "groups" ? targetGroups : [],
    createdAt: new Date().toISOString(),
  };

  const midias = readMidias();
  midias.unshift(media);
  writeMidias(midias);

  res.status(201).json(media);
});

app.delete("/api/midias/:id", (req, res) => {
  const midias = readMidias();
  const media = midias.find((item) => item.id === req.params.id);

  if (!media) {
    return res.status(404).json({ error: "Midia nao encontrada." });
  }

  const references = readJson(PLAYLIST_FILE, []).filter((p) =>
    p.items.some((i) => i.mediaId === media.id),
  );
  if (references.length)
    return res.status(409).json({
      error: `Remova a mídia das playlists primeiro: ${references.map((p) => p.name).join(", ")}`,
    });
  writeMidias(midias.filter((item) => item.id !== req.params.id));
  fs.rm(path.join(UPLOAD_DIR, media.filename), { force: true }, () => {});

  res.status(204).end();
});

function validPlaylist(id) {
  if (id === null || id === "") return null;
  if (!readJson(PLAYLIST_FILE, []).some((p) => p.id === id))
    throw new Error("Playlist não encontrada.");
  return id;
}
app.patch("/api/tvs/:id", (req, res) => {
  const tvs = readTvs();
  const tv = tvs.find((t) => t.id === req.params.id);
  if (!tv) return res.status(404).json({ error: "TV não encontrada." });
  if ("playlistId" in req.body)
    tv.playlistId = validPlaylist(req.body.playlistId);
  if ("ticker" in req.body)
    tv.ticker =
      req.body.ticker === null ? null : normalizeTicker(req.body.ticker);
  if ("playback" in req.body)
    tv.playback = normalizePlayback(req.body.playback);
  writeTvs(tvs);
  res.json(decorateTv(tv));
});
app.post("/api/heartbeat", (req, res) => {
  const id = String(req.body.tvId || "");
  if (!readTvs().some((t) => t.id === id)) return res.status(404).end();
  diagnostics.set(id, {
    mediaId: String(req.body.mediaId || "").slice(0, 100),
    audioBlocked: req.body.audioBlocked === true,
    error: String(req.body.error || "").slice(0, 200),
    receivedAt: new Date().toISOString(),
  });
  res.status(204).end();
});
app.get("/api/playlists", (_req, res) => res.json(readJson(PLAYLIST_FILE, [])));
function savePlaylist(req, res) {
  const playlists = readJson(PLAYLIST_FILE, []);
  const existing = req.params.id
    ? playlists.find((p) => p.id === req.params.id)
    : null;
  if (req.params.id && !existing)
    return res.status(404).json({ error: "Playlist não encontrada." });
  const name = String(req.body.name || "")
    .trim()
    .slice(0, 100);
  if (!name) throw new Error("Informe o nome da playlist.");
  if (!Array.isArray(req.body.items) || req.body.items.length > 1000)
    throw new Error("Lista de itens inválida.");
  const media = readMidias();
  const items = req.body.items.map((i) => {
    if (!media.some((m) => m.id === i.mediaId))
      throw new Error("Mídia não encontrada.");
    const duration = Number(i.durationSeconds ?? 10);
    if (!Number.isFinite(duration) || duration < 1 || duration > 3600)
      throw new Error("Duração deve estar entre 1 e 3600 segundos.");
    return {
      id: String(i.id || randomUUID()),
      mediaId: i.mediaId,
      durationSeconds: duration,
    };
  });
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("IDs de itens repetidos.");
  const result = {
    id: existing?.id || randomUUID(),
    name,
    items,
    updatedAt: new Date().toISOString(),
  };
  writeJson(
    PLAYLIST_FILE,
    existing
      ? playlists.map((p) => (p.id === existing.id ? result : p))
      : [...playlists, result],
  );
  res.status(existing ? 200 : 201).json(result);
}
app.post("/api/playlists", savePlaylist);
app.put("/api/playlists/:id", savePlaylist);
app.delete("/api/playlists/:id", (req, res) => {
  const id = req.params.id;
  const settings = readSettings();
  if (
    readTvs().some((t) => t.playlistId === id) ||
    settings.defaultPlaylistId === id ||
    Object.values(settings.groupPlaylists).includes(id)
  ) {
    return res.status(409).json({
      error:
        "Esta playlist está atribuída. Selecione herdar nos destinos antes de excluir.",
    });
  }
  writeJson(
    PLAYLIST_FILE,
    readJson(PLAYLIST_FILE, []).filter((p) => p.id !== id),
  );
  res.status(204).end();
});
app.post("/api/settings/playlists", (req, res) => {
  const settings = readSettings();
  const groups = {};
  for (const [group, id] of Object.entries(req.body.groupPlaylists || {})) {
    if (!getGroups(readTvs()).includes(group))
      throw new Error("Grupo inválido.");
    Object.defineProperty(groups, group, {
      value: validPlaylist(id),
      enumerable: true,
    });
  }
  settings.defaultPlaylistId = validPlaylist(req.body.defaultPlaylistId);
  settings.groupPlaylists = groups;
  writeSettings(settings);
  res.json(settings);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "Erro inesperado." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Sistema de TVs rodando em http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`TV geral: http://localhost:${PORT}/tv`);
  console.log(`TV especifica: http://localhost:${PORT}/tv?tvId=recepcao`);
});
