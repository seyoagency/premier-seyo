#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf-8"));
const VERSION = MANIFEST.version;
const STAGING_ROOT = path.join(ROOT, "dist", "windows", "staging");
const APP_ROOT = path.join(STAGING_ROOT, "app");

const NODE_RUNTIME = process.env.PREMIERSEYO_NODE_WIN_DIR || path.join(ROOT, "vendor", "windows", "node");
const FFMPEG_RUNTIME = process.env.PREMIERSEYO_FFMPEG_WIN_DIR || path.join(ROOT, "vendor", "windows", "ffmpeg");
const PREBUILT_CCX = process.env.PREMIERSEYO_CCX_PATH || "";
const SKIP_RUNTIME = process.env.PREMIERSEYO_SKIP_WIN_RUNTIME === "1";

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(rel, destRoot = APP_ROOT) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) throw new Error(`Missing file: ${rel}`);
  const dest = path.join(destRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing directory: ${src}`);
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (item) => !item.includes(`${path.sep}.git${path.sep}`),
  });
}

function requireRuntimeDir(src, label) {
  if (fs.existsSync(src)) return;
  if (SKIP_RUNTIME) {
    console.warn(`[package:win] ${label} runtime skipped: ${src}`);
    return;
  }
  throw new Error(
    `${label} runtime not found: ${src}\n` +
    `Set ${label === "Node" ? "PREMIERSEYO_NODE_WIN_DIR" : "PREMIERSEYO_FFMPEG_WIN_DIR"} ` +
    "or place the runtime under vendor/windows/ before building the offline installer."
  );
}

function main() {
  const bundlePath = path.join(ROOT, "src", "bundle.js");
  if (!fs.existsSync(bundlePath)) {
    throw new Error("src/bundle.js is missing. Run `npm run build:assets` before `npm run package:win`.");
  }

  cleanDir(APP_ROOT);

  const pluginSource = path.join(APP_ROOT, "plugin-source");
  fs.mkdirSync(pluginSource, { recursive: true });
  copyFile("manifest.json", pluginSource);
  copyDir(path.join(ROOT, "src"), path.join(pluginSource, "src"));
  copyDir(path.join(ROOT, "icons"), path.join(pluginSource, "icons"));

  copyDir(path.join(ROOT, "daemon"), path.join(APP_ROOT, "daemon"));
  copyFile("LICENSE");
  copyFile("README.md");

  const installerDest = path.join(APP_ROOT, "installer");
  copyDir(path.join(ROOT, "installer", "windows"), installerDest);

  const runtimeRoot = path.join(APP_ROOT, "runtime");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  requireRuntimeDir(NODE_RUNTIME, "Node");
  requireRuntimeDir(FFMPEG_RUNTIME, "FFmpeg");
  if (fs.existsSync(NODE_RUNTIME)) copyDir(NODE_RUNTIME, path.join(runtimeRoot, "node"));
  if (fs.existsSync(FFMPEG_RUNTIME)) copyDir(FFMPEG_RUNTIME, path.join(runtimeRoot, "ffmpeg"));

  const pluginDir = path.join(APP_ROOT, "plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  if (PREBUILT_CCX) {
    if (!fs.existsSync(PREBUILT_CCX)) throw new Error(`PREMIERSEYO_CCX_PATH not found: ${PREBUILT_CCX}`);
    fs.copyFileSync(PREBUILT_CCX, path.join(pluginDir, "PremierSEYO.ccx"));
  }

  const manifest = {
    app: "PremierSEYO",
    version: VERSION,
    createdAt: new Date().toISOString(),
    runtime: {
      node: fs.existsSync(path.join(runtimeRoot, "node", "node.exe")),
      ffmpeg: fs.existsSync(path.join(runtimeRoot, "ffmpeg", "bin", "ffmpeg.exe")),
      ccx: fs.existsSync(path.join(pluginDir, "PremierSEYO.ccx")),
    },
  };
  fs.writeFileSync(path.join(STAGING_ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[package:win] staged ${APP_ROOT}`);
}

try {
  main();
} catch (err) {
  console.error(`[package:win] ${err.message}`);
  process.exit(1);
}
