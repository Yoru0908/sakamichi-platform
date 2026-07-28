import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../../../browser-extension/miguri-sync/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const backgroundSource = readFileSync(
  new URL(
    "../../../browser-extension/miguri-sync/background.js",
    import.meta.url,
  ),
  "utf8",
);
const officialSource = readFileSync(
  new URL(
    "../../../browser-extension/miguri-sync/official.js",
    import.meta.url,
  ),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL("./MiguriDashboard.tsx", import.meta.url),
  "utf8",
);

test("Miguri extension has only scoped site, storage, and tab permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "tabs"]);
  assert.equal(manifest.permissions.includes("cookies"), false);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.ok(
    manifest.host_permissions.every(
      (origin) =>
        origin.includes("46log.com") ||
        origin.includes("fortunemusic.jp") ||
        origin.includes("fortunemeets.app"),
    ),
  );
});

test("Miguri extension keeps the official login job separate from normalized result delivery", () => {
  assert.match(backgroundSource, /chrome\.storage\.session/);
  assert.match(backgroundSource, /MIGURI46LOG_RESULT/);
  assert.match(officialSource, /sourceKey/);
  assert.match(officialSource, /unitPriceYen/);
  assert.match(officialSource, /spendYen/);
  assert.doesNotMatch(
    officialSource,
    /input\[type=["']password["']\][\s\S]{0,80}\.value/,
  );
  assert.doesNotMatch(officialSource, /document\.cookie/);
});

test("Dashboard presents extension sync first and keeps bookmark import as compatibility mode", () => {
  assert.match(dashboardSource, /下载同步扩展/);
  assert.match(dashboardSource, /同步 forTUNE music/);
  assert.match(dashboardSource, /同步 forTUNE meets/);
  assert.match(dashboardSource, /兼容导入/);
  assert.doesNotMatch(dashboardSource, /46log 不接收 forTUNE/);
});
