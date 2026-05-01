#!/usr/bin/env node
/**
 * Deploy script — source -> UXP plugin install copy
 *
 * Premiere Pro UXP panelleri source dizinini degil
 * ~/Library/Application Support/Adobe/UXP/Plugins/External/<plugin-id>_<version>
 * altina install edilmis kopyayi kullanir. Bu script her build sonrasi
 * src/ + manifest.json + icons/ dizinlerini o kopyaya senkronlar.
 *
 * Premiere'i kapatip tekrar acmak gerekiyor panelin yeni bundle'i almasi icin.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf-8"));
const PLUGIN_ID = MANIFEST.id;
const VERSION = MANIFEST.version;

const PLUGIN_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Adobe",
  "UXP",
  "Plugins",
  "External",
  `${PLUGIN_ID}_${VERSION}`
);

if (!fs.existsSync(PLUGIN_DIR)) {
  console.warn(`[deploy] Plugin install dizini bulunamadi: ${PLUGIN_DIR}`);
  console.warn(`[deploy] Plugin'i UXP Developer Tool ile yuklediginizden emin olun. Skip.`);
  process.exit(0);
}

const pairs = [
  { src: "manifest.json", kind: "file" },
  { src: "src/bundle.js", kind: "file" },
  { src: "src/index.html", kind: "file" },
  { src: "src/index.js", kind: "file" },
  { src: "src/core", kind: "dir" },
  { src: "src/utils", kind: "dir" },
  { src: "src/timeline", kind: "dir" },
  { src: "src/srt", kind: "dir" },
  { src: "src/ui", kind: "dir" },
  { src: "icons", kind: "dir" },
];

for (const pair of pairs) {
  const srcPath = path.join(ROOT, pair.src);
  const destPath = path.join(PLUGIN_DIR, pair.src);
  if (!fs.existsSync(srcPath)) continue;
  if (pair.kind === "file") {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  } else {
    fs.mkdirSync(destPath, { recursive: true });
    execSync(`rsync -a --delete ${JSON.stringify(srcPath + "/")} ${JSON.stringify(destPath + "/")}`);
  }
}

console.log(`[deploy] ${PLUGIN_DIR}`);
console.log(`[deploy] Premiere Pro'yu kapatip tekrar acin (panel yeni bundle'i yukleyecek).`);
