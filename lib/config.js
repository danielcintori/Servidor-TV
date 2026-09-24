export const tickerDefaults = {
  enabled: false,
  text: "",
  speedSeconds: 24,
  fontSize: 32,
  height: 72,
  backgroundColor: "#0f766e",
  color: "#ffffff",
};
function numeric(value, fallback, min, max) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max)
    throw new Error(`Valor deve estar entre ${min} e ${max}.`);
  return number;
}
export function normalizeTicker(input) {
  const out = { ...tickerDefaults, ...input };
  out.enabled = input.enabled === true;
  out.text = String(input.text || "")
    .trim()
    .slice(0, 240);
  out.speedSeconds = numeric(input.speedSeconds, 24, 8, 90);
  out.fontSize = numeric(input.fontSize, 32, 12, 120);
  out.height = numeric(input.height, 72, 32, 300);
  if (out.height < out.fontSize * 1.2 + 8)
    throw new Error("Aumente a altura da faixa para acomodar a fonte.");
  for (const key of ["color", "backgroundColor"])
    if (!/^#[0-9a-f]{6}$/i.test(out[key]))
      throw new Error("Cor inválida; use #RRGGBB.");
  return out;
}
export function normalizePlayback(input) {
  return {
    volume: numeric(input.volume, 50, 0, 100),
    muted: input.muted !== false,
    delayEnabled: input.delayEnabled === true,
    delaySeconds: numeric(input.delaySeconds, 0, 0, 600),
  };
}
export function resolvePlaylist(tv, settings, playlists, media, legacy) {
  const groupId = Object.hasOwn(settings.groupPlaylists || {}, tv?.group)
    ? settings.groupPlaylists[tv.group]
    : null;
  const id = tv?.playlistId || groupId || settings.defaultPlaylistId;
  if (!id) return { source: "Distribuição original", items: legacy };
  const selected = playlists.find((p) => p.id === id);
  if (!selected) return { source: "Playlist indisponível", items: [] };
  return {
    source: selected.name,
    items: selected.items.flatMap((item) => {
      const file = media.find((m) => m.id === item.mediaId);
      return file
        ? [{ ...file, entryId: item.id, durationSeconds: item.durationSeconds }]
        : [];
    }),
  };
}
