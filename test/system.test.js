import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import {
  normalizeTicker,
  normalizePlayback,
  resolvePlaylist,
} from "../lib/config.js";

test("validation and explicit empty playlist precedence", () => {
  assert.throws(() => normalizeTicker({ fontSize: 100, height: 40 }));
  assert.throws(() => normalizeTicker({ color: "javascript:alert(1)" }));
  assert.throws(() => normalizePlayback({ volume: 101 }));
  assert.throws(() => normalizePlayback({ delaySeconds: -1 }));
  const settings = { groupPlaylists: { G: "g" }, defaultPlaylistId: "d" };
  const media = [{ id: "m", url: "/uploads/m.png" }];
  const playlists = [
    { id: "t", name: "TV vazia", items: [] },
    {
      id: "g",
      name: "Grupo",
      items: [{ id: "i", mediaId: "m", durationSeconds: 7 }],
    },
  ];
  assert.equal(
    resolvePlaylist(
      { group: "G", playlistId: "t" },
      settings,
      playlists,
      media,
      media,
    ).items.length,
    0,
  );
  assert.equal(
    resolvePlaylist({ group: "G" }, settings, playlists, media, media).items[0]
      .durationSeconds,
    7,
  );
  assert.deepEqual(
    resolvePlaylist({}, { groupPlaylists: {} }, [], media, media).items,
    media,
  );
});

test("migration, isolation, CRUD, auth, persistence and invalid input", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "infosesi-test-"));
  let child;
  const port = 22000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const headers = {
    authorization: `Basic ${Buffer.from("admin:test-secret").toString("base64")}`,
    "content-type": "application/json",
  };
  const tvs = [
    { id: "a", name: "TV A", group: "G" },
    { id: "b", name: "TV B", group: "G" },
  ];
  const media = [
    { id: "all", url: "/uploads/a.png", type: "image", targetMode: "all" },
    {
      id: "group",
      url: "/uploads/b.png",
      type: "image",
      targetMode: "groups",
      targetGroups: ["G"],
    },
    {
      id: "only-a",
      url: "/uploads/c.png",
      type: "image",
      targetMode: "tvs",
      targetTvIds: ["a"],
    },
  ];
  await writeFile(
    path.join(root, "settings.json"),
    JSON.stringify({
      ticker: { enabled: true, text: "Legado", speedSeconds: 24 },
    }),
  );
  await writeFile(path.join(root, "tvs.json"), JSON.stringify(tvs));
  await writeFile(path.join(root, "midias.json"), JSON.stringify(media));
  let logs = "";
  async function start() {
    child = spawn(process.execPath, ["server.js"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: root,
        UPLOAD_DIR: path.join(root, "uploads"),
        ADMIN_USER: "admin",
        ADMIN_PASSWORD: "test-secret",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/healthz")).ok) return;
      } catch {}
      if (child.exitCode !== null) throw new Error(logs);
      await wait(50);
    }
    throw new Error(logs);
  }
  async function stop() {
    if (child?.exitCode === null) {
      const closed = once(child, "exit");
      child.kill();
      await closed;
    }
  }
  t.after(async () => {
    await stop();
    await rm(root, { recursive: true, force: true });
  });
  async function request(url, body, method = "POST") {
    const r = await fetch(base + url, {
      method: body === undefined ? "GET" : method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: r.status === 204 ? null : await r.json() };
  }
  await start();
  assert.equal((await fetch(base + "/api/config")).status, 401);
  assert.equal((await fetch(base + "/admin.html")).status, 401);
  assert.equal((await fetch(base + "/tv?tvId=a")).status, 200);
  assert.equal(
    (
      await fetch(base + "/api/settings/ticker", {
        method: "POST",
        headers: { ...headers, origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  const before = (await request("/api/midia-atual?tvId=a")).data;
  assert.deepEqual(
    before.playlist.map((m) => m.id),
    ["all", "group", "only-a"],
  );
  assert.deepEqual(
    (await request("/api/midia-atual?tvId=b")).data.playlist.map((m) => m.id),
    ["all", "group"],
  );
  assert.equal(before.ticker.text, "Legado");
  assert.equal(
    (await readdir(root)).filter((f) => f.startsWith("backup-v1-")).length,
    1,
  );
  const p = (
    await request("/api/playlists", {
      name: "Só A",
      items: [{ mediaId: "only-a", durationSeconds: 5 }],
    })
  ).data;
  const empty = (await request("/api/playlists", { name: "Vazia", items: [] }))
    .data;
  assert.equal(
    (
      await request("/api/playlists", {
        name: "Inválida",
        items: [{ mediaId: "missing" }],
      })
    ).status,
    400,
  );
  await request(
    "/api/tvs/a",
    {
      playlistId: p.id,
      playback: {
        volume: 25,
        muted: false,
        delayEnabled: true,
        delaySeconds: 3,
      },
      ticker: {
        enabled: true,
        text: "TV A",
        fontSize: 40,
        height: 80,
        color: "#ff0000",
        backgroundColor: "#000000",
      },
    },
    "PATCH",
  );
  await request("/api/settings/playlists", {
    defaultPlaylistId: null,
    groupPlaylists: { G: empty.id },
  });
  let a = (await request("/api/midia-atual?tvId=a")).data;
  assert.equal(a.playlist.length, 1);
  assert.equal(a.ticker.fontSize, 40);
  assert.equal(a.playback.volume, 25);
  assert.equal(a.playback.muted, false);
  assert.equal(a.playback.delaySeconds, 3);
  assert.equal(
    (await request("/api/midia-atual?tvId=b")).data.playlist.length,
    0,
  );
  assert.equal((await request(`/api/midias/only-a`, {}, "DELETE")).status, 409);
  assert.equal(
    (await request(`/api/playlists/${p.id}`, {}, "DELETE")).status,
    409,
  );
  assert.equal(
    (await request("/api/tvs/a", { playlistId: "missing" }, "PATCH")).status,
    400,
  );
  assert.equal(
    (await request("/api/tvs/a", { playback: { volume: -5 } }, "PATCH")).status,
    400,
  );
  await request("/api/settings/ticker", {
    enabled: true,
    text: "Nova geral",
    fontSize: 24,
    height: 60,
    color: "#ffffff",
    backgroundColor: "#102030",
  });
  assert.equal(
    (await request("/api/midia-atual?tvId=a")).data.ticker.text,
    "TV A",
  );
  await request("/api/tvs/a", { ticker: null }, "PATCH");
  assert.equal(
    (await request("/api/midia-atual?tvId=a")).data.ticker.text,
    "Nova geral",
  );
  await request("/api/heartbeat", {
    tvId: "a",
    mediaId: "only-a",
    audioBlocked: true,
  });
  assert.equal(
    (await request("/api/config")).data.tvs[0].diagnostics.audioBlocked,
    true,
  );
  const form = new FormData();
  form.append("media", new Blob(["test"], { type: "image/png" }), "sample.png");
  form.append("targetMode", "library");
  const uploaded = await fetch(base + "/api/midias", {
    method: "POST",
    headers: { authorization: headers.authorization },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();
  assert.equal((await fetch(base + file.url)).status, 200);
  await request("/api/tvs/a", { playlistId: null }, "PATCH");
  await request("/api/settings/playlists", {
    defaultPlaylistId: null,
    groupPlaylists: {},
  });
  assert.deepEqual(
    (await request("/api/midia-atual?tvId=a")).data.playlist.map((m) => m.id),
    ["all", "group", "only-a"],
  );
  await stop();
  await start();
  assert.equal(
    (await readdir(root)).filter((f) => f.startsWith("backup-v1-")).length,
    1,
  );
  assert.equal((await request("/api/playlists")).data.length, 2);
  assert.equal(
    (await request("/api/midia-atual?tvId=a")).data.playback.volume,
    25,
  );
  assert.equal((await fetch(base + file.url)).status, 200);
  assert.equal(
    JSON.parse(await readFile(path.join(root, "settings.json"))).schemaVersion,
    2,
  );
});
