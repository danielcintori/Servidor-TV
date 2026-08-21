import express from "express";
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
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DB_FILE = path.join(DATA_DIR, "midias.json");
const TV_DB_FILE = path.join(DATA_DIR, "tvs.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const ONLINE_WINDOW_MS = 45 * 1000;
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".webm"]);

const defaultTvs = [
  { id: "recepcao", name: "Recepcao", group: "Geral", createdAt: new Date().toISOString(), lastSeenAt: null },
  { id: "corredor", name: "Corredor", group: "Geral", createdAt: new Date().toISOString(), lastSeenAt: null },
  { id: "sala-professores", name: "Sala dos professores", group: "Equipe", createdAt: new Date().toISOString(), lastSeenAt: null }
];

const defaultSettings = {
  ticker: {
    enabled: false,
    text: "",
    speedSeconds: 24,
    updatedAt: new Date().toISOString()
  }
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Erro ao ler ${path.basename(file)}:`, error);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function ensureJson(file, fallback) {
  if (!fs.existsSync(file)) {
    writeJson(file, fallback);
  }
}

ensureJson(MEDIA_DB_FILE, []);
ensureJson(TV_DB_FILE, defaultTvs);
ensureJson(SETTINGS_FILE, defaultSettings);

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
  return { ...defaultSettings, ...readJson(SETTINGS_FILE, defaultSettings) };
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
  return [...new Set(tvs.map((tv) => tv.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function decorateTv(tv) {
  const lastSeenAt = tv.lastSeenAt ? Date.parse(tv.lastSeenAt) : 0;
  const online = Boolean(lastSeenAt && Date.now() - lastSeenAt <= ONLINE_WINDOW_MS);
  return { ...tv, online };
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
  const targetGroups = Array.isArray(media.targetGroups) ? media.targetGroups : [];

  if (targetMode === "all") return true;
  if (targetMode === "tvs") return Boolean(tvId && targetTvIds.includes(tvId));
  if (targetMode === "groups") return Boolean(tv?.group && targetGroups.includes(tv.group));
  return true;
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const baseName = slugify(path.basename(file.originalname, extension));
    callback(null, `${Date.now()}-${baseName || "midia"}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return callback(new Error("Formato nao permitido. Use jpg, png, webp, mp4 ou webm."));
    }
    callback(null, true);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR, {
  maxAge: "1h",
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
}));

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
    settings: readSettings()
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
    lastSeenAt: null
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
      : []
  }));
  writeMidias(midias);

  res.status(204).end();
});

app.post("/api/settings/ticker", (req, res) => {
  const settings = readSettings();
  const text = String(req.body.text || "").trim().slice(0, 240);
  const speedSeconds = Number.parseInt(req.body.speedSeconds, 10);

  settings.ticker = {
    enabled: Boolean(req.body.enabled) && text.length > 0,
    text,
    speedSeconds: Number.isFinite(speedSeconds) ? Math.min(Math.max(speedSeconds, 8), 90) : 24,
    updatedAt: new Date().toISOString()
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
  const playlist = readMidias().filter((media) => isMediaForTv(media, tv, tvId));

  res.json({
    updatedAt: playlist[0]?.createdAt || null,
    current: playlist[0] || null,
    playlist,
    ticker: settings.ticker,
    tv: tv ? decorateTv(tv) : null
  });
});

app.post("/api/midias", upload.single("media"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Envie um arquivo no campo media." });
  }

  const tvs = readTvs();
  const groups = getGroups(tvs);
  const durationSeconds = Number.parseInt(req.body.durationSeconds, 10);
  const targetMode = ["all", "groups", "tvs"].includes(req.body.targetMode) ? req.body.targetMode : "all";
  const targetTvIds = parseJsonArray(req.body.targetTvIds).filter((id) => tvs.some((tv) => tv.id === id));
  const targetGroups = parseJsonArray(req.body.targetGroups).filter((group) => groups.includes(group));

  if (targetMode === "tvs" && !targetTvIds.length) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), { force: true }, () => {});
    return res.status(400).json({ error: "Escolha pelo menos uma TV para este conteudo." });
  }

  if (targetMode === "groups" && !targetGroups.length) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), { force: true }, () => {});
    return res.status(400).json({ error: "Escolha pelo menos um grupo para este conteudo." });
  }

  const media = {
    id: `${Date.now()}`,
    originalName: req.file.originalname,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    type: getMediaType(req.file.filename),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 10,
    size: req.file.size,
    targetMode,
    targetTvIds: targetMode === "tvs" ? targetTvIds : [],
    targetGroups: targetMode === "groups" ? targetGroups : [],
    createdAt: new Date().toISOString()
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

  writeMidias(midias.filter((item) => item.id !== req.params.id));
  fs.rm(path.join(UPLOAD_DIR, media.filename), { force: true }, () => {});

  res.status(204).end();
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
